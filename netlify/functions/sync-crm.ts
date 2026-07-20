// Sync horario del CRM (HubSpot → Supabase). PRD §6 / §6.1.
// Bloqueado mientras HUBSPOT_PRIVATE_APP_TOKEN no esté en el entorno.
// Idempotente: upsert por hubspot_*_id.

import type { Config } from "@netlify/functions";
import {
  fetchContacts,
  fetchDeals,
  fetchDealLinkedContacts,
  fetchDealLinkedCompanies,
  fetchEngagements,
} from "@/lib/hubspot";
import { requireSupabaseAdmin } from "@/lib/supabase/admin";

type StepResult = { fetched: number; upserted: number; error?: string };

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
    .update({
      status: ok ? "ok" : "error",
      rows,
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
}

// Upsert por lotes con error visible. Si un lote falla, lanza para que el
// catch del run lo registre y los logs muestren la causa (antes se tragaban).
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

// Ejecuta una etapa (fetch+upsert) sin abortar el run si falla. Devuelve
// counts + mensaje de error que se loguea y se incluye en la respuesta.
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

export default async (): Promise<Response> => {
  if (!process.env.HUBSPOT_PRIVATE_APP_TOKEN) {
    return new Response(
      JSON.stringify({ skipped: true, reason: "HUBSPOT_PRIVATE_APP_TOKEN no configurada" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  const run = await startedRun("hubspot");
  console.log(`[sync-crm] run started id=${run.id}`);

  // Orden pensado para que las vistas KPI se refresquen aunque el paso más
  // lento (engagements) se quede sin tiempo: primero lo que alimenta las
  // vistas (contacts → deals → companies asociadas → contactos de deals),
  // luego refresh, y engagements al final como best-effort. Antes companies
  // iba primero y traía ~10k filas → tormenta de 429 y timeout.
  const contacts = await runStep(
    "contacts",
    fetchContacts as () => Promise<Record<string, unknown>[]>,
    "contacts",
    "hubspot_contact_id",
  );
  // Deals: `runStep` descarta las filas tras el upsert, pero necesitamos los
  // ids de contacto/compañía asociados para los pasos siguientes → los
  // capturamos en `dealRows`.
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
  // Companies: SOLO las asociadas a deals (batch-read por id), no las ~10k
  // creadas desde el cutoff. `accounts` solo se usa para el fallback de país
  // del deal (y ABM, on hold), así que basta con estas — y encima trae la
  // compañía aunque se creara antes del cutoff.
  const companies = !deals.error
    ? await runStep(
        "companies",
        () => fetchDealLinkedCompanies(dealRows) as unknown as Promise<Record<string, unknown>[]>,
        "accounts",
        "hubspot_company_id",
      )
    : { fetched: 0, upserted: 0 };
  // Contactos asociados a esos deals (champion / primer contacto) que
  // `fetchContacts` no trae por ser anteriores a HUBSPOT_BACKFILL_FROM o no
  // ser Inbound — sin esto un deal de cuenta existente no se puede atribuir.
  const dealsLinkedContacts = !deals.error
    ? await runStep(
        "deals_linked_contacts",
        () => fetchDealLinkedContacts(dealRows) as unknown as Promise<Record<string, unknown>[]>,
        "contacts",
        "hubspot_contact_id",
      )
    : { fetched: 0, upserted: 0 };

  // Refrescar vistas ANTES de engagements: las KPI dependen de
  // contacts/deals/accounts, no de activities. Así un engagements lento (o
  // que agote el tiempo) no deja las vistas sin refrescar.
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

  // Engagements (timeline ABM) — solo si ABM está activo (DECISIONES #11,
  // igual que el cron compute-heat). Es el paso más pesado (pagina
  // meetings/notes/emails/calls) y alimenta `activities`, que solo usa ABM
  // (on hold). Al final y gated para no gastar tiempo del sync horario.
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

  const breakdown = { contacts, deals, companies, dealsLinkedContacts, engagements };
  const total =
    contacts.upserted + deals.upserted + companies.upserted +
    dealsLinkedContacts.upserted + engagements.upserted;
  const errors = [contacts, deals, companies, dealsLinkedContacts, engagements]
    .map((s) => s.error)
    .filter(Boolean) as string[];

  const ok = errors.length === 0;
  await finishRun(run.id, ok, total);

  console.log(`[sync-crm] done ok=${ok} refreshed=${refreshed} total=${total} errors=${errors.length}`);

  return new Response(
    JSON.stringify({ ok, refreshed, total, breakdown, errors }, null, 2),
    {
      status: ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    },
  );
};

export const config: Config = {
  schedule: "@hourly",                        // cada hora
};
