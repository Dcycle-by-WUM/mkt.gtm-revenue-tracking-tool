// Lógica de sincronización CRM (HubSpot → Supabase), compartida entre el cron
// horario de Netlify (netlify/functions/sync-crm.ts) y el endpoint bajo demanda
// (app/api/refresh-crm/route.ts, botón "Actualizar HubSpot"). Idempotente:
// upsert por hubspot_*_id. Bloqueada mientras HUBSPOT_PRIVATE_APP_TOKEN no esté.

import {
  fetchContacts,
  fetchDeals,
  fetchDealLinkedContacts,
  fetchDealLinkedCompanies,
  fetchEngagements,
  fetchOwners,
  streamCalls,
  type HsEngagement,
} from "@/lib/hubspot";
import { requireSupabaseAdmin } from "@/lib/supabase/admin";

export type StepResult = { fetched: number; upserted: number; error?: string };
export type CrmSyncResult =
  | { skipped: true; reason: string }
  | {
      skipped?: false;
      ok: boolean;
      refreshed: boolean;
      total: number;
      breakdown: Record<string, StepResult>;
      errors: string[];
    };

async function startedRun(source: string): Promise<{ id: string }> {
  const sb = requireSupabaseAdmin();
  const r = await sb.from("sync_runs").insert({ source, status: "running" }).select("id").single();
  if (r.error || !r.data) throw r.error ?? new Error("sync_runs insert failed");
  return r.data;
}

async function finishRun(id: string, ok: boolean, rows: number): Promise<void> {
  const sb = requireSupabaseAdmin();
  await sb
    .from("sync_runs")
    .update({ status: ok ? "ok" : "error", rows, finished_at: new Date().toISOString() })
    .eq("id", id);
}

// Upsert por lotes con error visible. Si un lote falla, lanza para que el catch
// del run lo registre y los logs muestren la causa.
async function batchUpsert(
  table: string,
  rows: Record<string, unknown>[],
  conflict: string,
  size = 200,
): Promise<number> {
  const sb = requireSupabaseAdmin();
  let upserted = 0;
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size);
    const { error } = await sb.from(table).upsert(batch as never, { onConflict: conflict });
    if (error) {
      throw new Error(`upsert ${table} batch ${i}-${i + batch.length} → ${error.message} (code ${error.code})`);
    }
    upserted += batch.length;
  }
  return upserted;
}

// Ejecuta una etapa (fetch+upsert) sin abortar el run si falla.
async function runStep(
  name: string,
  fetcher: () => Promise<Record<string, unknown>[]>,
  table: string,
  conflict: string,
): Promise<StepResult> {
  try {
    console.log(`[sync-crm] ${name}: fetching from HubSpot…`);
    const rows = await fetcher();
    console.log(`[sync-crm] ${name}: fetched=${rows.length}`);
    if (rows.length === 0) return { fetched: 0, upserted: 0 };
    const stamped = rows.map((r) => ({ ...r, synced_at: new Date().toISOString() }));
    const upserted = await batchUpsert(table, stamped, conflict);
    console.log(`[sync-crm] ${name}: upserted=${upserted}`);
    return { fetched: rows.length, upserted };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[sync-crm] ${name}: FAILED → ${msg}`);
    return { fetched: 0, upserted: 0, error: msg };
  }
}

// Ingesta de llamadas (métrica SDRs Overview). Vuelca por páginas de forma
// incremental (persiste aunque el job se quede sin tiempo) y reanuda por marca
// de agua: `activities` es su propio checkpoint. Por volumen (~82k llamadas) el
// backfill completo puede tardar varios syncs horarios; cada uno extiende el
// histórico hacia atrás y recoge las nuevas por delante.
//   - Cabecera: llamadas nuevas por encima de la más reciente ya ingerida.
//   - Backfill: extiende por debajo de la más antigua, con presupuesto de
//     páginas para caber en el timeout de la función.
const CALLS_HEAD_MAX_PAGES = 30;
const CALLS_BACKFILL_MAX_PAGES = 120;

async function syncCalls(): Promise<StepResult> {
  try {
    const sb = requireSupabaseAdmin();
    const [newest, oldest] = await Promise.all([
      sb.from("activities").select("occurred_at").eq("kind", "call").order("occurred_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("activities").select("occurred_at").eq("kind", "call").order("occurred_at", { ascending: true }).limit(1).maybeSingle(),
    ]);
    if (newest.error) throw new Error(newest.error.message);

    let upserted = 0;
    const sink = async (rows: HsEngagement[]): Promise<void> => {
      const stamped = rows.map((r) => ({ ...r, synced_at: new Date().toISOString() }));
      upserted += await batchUpsert("activities", stamped as unknown as Record<string, unknown>[], "hubspot_engagement_id");
    };

    // Cabecera: nuevas llamadas por encima de la marca de agua superior.
    if (newest.data?.occurred_at) {
      await streamCalls(sink, {
        gteMs: new Date(newest.data.occurred_at).getTime() + 1,
        direction: "ASCENDING",
        maxPages: CALLS_HEAD_MAX_PAGES,
      });
    }
    // Backfill hacia atrás (o completo en el primer sync), con presupuesto.
    const res = await streamCalls(sink, {
      ltMs: oldest.data?.occurred_at ? new Date(oldest.data.occurred_at).getTime() : undefined,
      direction: "DESCENDING",
      maxPages: CALLS_BACKFILL_MAX_PAGES,
    });
    if (res.stoppedEarly) {
      console.log(`[sync-crm] calls: upserted=${upserted} (backfill parcial — quedan llamadas más antiguas para el próximo sync)`);
    } else {
      console.log(`[sync-crm] calls: upserted=${upserted} (backfill al día)`);
    }
    return { fetched: upserted, upserted };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[sync-crm] calls: FAILED → ${msg}`);
    return { fetched: 0, upserted: 0, error: msg };
  }
}

/**
 * Corre el sync completo CRM. Devuelve `{ skipped }` si falta el token, o el
 * desglose por etapa. `trigger` solo etiqueta el origen en `sync_runs`
 * ("hubspot" para el cron, "hubspot-manual" para el botón).
 */
export async function runCrmSync(trigger: "hubspot" | "hubspot-manual" = "hubspot"): Promise<CrmSyncResult> {
  if (!process.env.HUBSPOT_PRIVATE_APP_TOKEN) {
    return { skipped: true, reason: "HUBSPOT_PRIVATE_APP_TOKEN no configurada" };
  }

  const run = await startedRun(trigger);
  console.log(`[sync-crm] run started id=${run.id} trigger=${trigger}`);

  const contacts = await runStep(
    "contacts",
    fetchContacts as () => Promise<Record<string, unknown>[]>,
    "contacts",
    "hubspot_contact_id",
  );
  let dealRows: Awaited<ReturnType<typeof fetchDeals>> = [];
  const deals = await runStep(
    "deals",
    async () => {
      dealRows = await fetchDeals();
      return dealRows as unknown as Record<string, unknown>[];
    },
    "deals",
    "hubspot_deal_id",
  );
  const companies = !deals.error
    ? await runStep(
        "companies",
        () => fetchDealLinkedCompanies(dealRows) as unknown as Promise<Record<string, unknown>[]>,
        "accounts",
        "hubspot_company_id",
      )
    : { fetched: 0, upserted: 0 };
  const dealsLinkedContacts = !deals.error
    ? await runStep(
        "deals_linked_contacts",
        () => fetchDealLinkedContacts(dealRows) as unknown as Promise<Record<string, unknown>[]>,
        "contacts",
        "hubspot_contact_id",
      )
    : { fetched: 0, upserted: 0 };

  let refreshed = false;
  if (!contacts.error && !deals.error && !companies.error && !dealsLinkedContacts.error) {
    try {
      await requireSupabaseAdmin().rpc("refresh_kpi_views");
      refreshed = true;
    } catch (e) {
      console.error(`[sync-crm] refresh_kpi_views failed: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    console.warn(`[sync-crm] skipped refresh_kpi_views — un paso previo falló`);
  }

  // Owners + llamadas: siempre (métrica SDRs Overview). Independientes del gate
  // ABM_ENABLED, que solo controla el timeline completo (meetings/notes/emails).
  const owners = await runStep(
    "owners",
    fetchOwners as () => Promise<Record<string, unknown>[]>,
    "owners",
    "id",
  );
  const calls = await syncCalls();

  let engagements: StepResult = { fetched: 0, upserted: 0 };
  if (process.env.ABM_ENABLED === "true") {
    engagements = await runStep(
      "engagements",
      fetchEngagements as () => Promise<Record<string, unknown>[]>,
      "activities",
      "hubspot_engagement_id",
    );
  } else {
    console.log("[sync-crm] engagements: omitido (ABM on hold; ABM_ENABLED=true para ingerirlos)");
  }

  const breakdown = { contacts, deals, companies, dealsLinkedContacts, owners, calls, engagements };
  const total =
    contacts.upserted + deals.upserted + companies.upserted + dealsLinkedContacts.upserted +
    owners.upserted + calls.upserted + engagements.upserted;
  const errors = [contacts, deals, companies, dealsLinkedContacts, owners, calls, engagements]
    .map((s) => s.error)
    .filter(Boolean) as string[];

  const ok = errors.length === 0;
  await finishRun(run.id, ok, total);
  console.log(`[sync-crm] done ok=${ok} refreshed=${refreshed} total=${total} errors=${errors.length}`);

  return { ok, refreshed, total, breakdown, errors };
}
