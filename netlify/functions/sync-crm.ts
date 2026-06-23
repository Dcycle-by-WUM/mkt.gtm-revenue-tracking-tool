// Sync horario del CRM (HubSpot → Supabase). PRD §6 / §6.1.
// Bloqueado mientras HUBSPOT_PRIVATE_APP_TOKEN no esté en el entorno.
// Idempotente: upsert por hubspot_*_id.

import type { Config } from "@netlify/functions";
import {
  fetchCompanies,
  fetchContacts,
  fetchDeals,
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

  // Etapas secuenciales para que el log diga claramente qué falla. (Si
  // alguna requiriera paralelismo, usar Promise.allSettled para no abortar.)
  const companies = await runStep(
    "companies",
    fetchCompanies as () => Promise<Record<string, unknown>[]>,
    "accounts",
    "hubspot_company_id",
  );
  const contacts = await runStep(
    "contacts",
    fetchContacts as () => Promise<Record<string, unknown>[]>,
    "contacts",
    "hubspot_contact_id",
  );
  const deals = await runStep(
    "deals",
    fetchDeals as () => Promise<Record<string, unknown>[]>,
    "deals",
    "hubspot_deal_id",
  );
  const engagements = await runStep(
    "engagements",
    fetchEngagements as () => Promise<Record<string, unknown>[]>,
    "activities",
    "hubspot_engagement_id",
  );

  const breakdown = { companies, contacts, deals, engagements };
  const total =
    companies.upserted + contacts.upserted + deals.upserted + engagements.upserted;
  const errors = [companies, contacts, deals, engagements]
    .map((s) => s.error)
    .filter(Boolean) as string[];

  const ok = errors.length === 0;

  // Solo refrescar vistas si contacts y deals se sincronizaron sin errores.
  if (!contacts.error && !deals.error) {
    try {
      const sb = requireSupabaseAdmin();
      await sb.rpc("refresh_kpi_views");
    } catch (e) {
      console.error(`[sync-crm] refresh_kpi_views failed: ${e instanceof Error ? e.message : e}`);
    }
  } else {
    console.warn(`[sync-crm] skipped refresh_kpi_views — contacts or deals had errors`);
  }
  await finishRun(run.id, ok, total);

  console.log(`[sync-crm] done ok=${ok} total=${total} errors=${errors.length}`);

  return new Response(
    JSON.stringify({ ok, total, breakdown, errors }, null, 2),
    {
      status: ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    },
  );
};

export const config: Config = {
  schedule: "@hourly",                        // cada hora
};
