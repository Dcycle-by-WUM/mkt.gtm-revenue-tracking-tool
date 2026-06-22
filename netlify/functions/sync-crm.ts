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

async function batchUpsert(
  table: string,
  rows: Record<string, unknown>[],
  conflict: string,
  size = 200,
): Promise<void> {
  const sb = requireSupabaseAdmin();
  for (let i = 0; i < rows.length; i += size) {
    await sb.from(table).upsert(rows.slice(i, i + size) as never, { onConflict: conflict });
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
  let total = 0;
  try {
    const [companies, contacts, deals, engagements] = await Promise.all([
      fetchCompanies(),
      fetchContacts(),
      fetchDeals(),
      fetchEngagements(),
    ]);

    await batchUpsert("accounts", companies.map((c) => ({ ...c, synced_at: new Date().toISOString() })), "hubspot_company_id");
    await batchUpsert("contacts", contacts.map((c) => ({ ...c, synced_at: new Date().toISOString() })), "hubspot_contact_id");
    await batchUpsert("deals", deals.map((d) => ({ ...d, synced_at: new Date().toISOString() })), "hubspot_deal_id");
    await batchUpsert("activities", engagements.map((e) => ({ ...e, synced_at: new Date().toISOString() })), "hubspot_engagement_id");

    total = companies.length + contacts.length + deals.length + engagements.length;

    // Refresca vistas materializadas para que la UI vea los datos nuevos.
    const sb = requireSupabaseAdmin();
    try { await sb.rpc("refresh_kpi_views"); } catch { /* ignore */ }

    await finishRun(run.id, true, total);
    return new Response(
      JSON.stringify({ ok: true, total, breakdown: { companies: companies.length, contacts: contacts.length, deals: deals.length, engagements: engagements.length } }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await finishRun(run.id, false, total);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config: Config = {
  schedule: "@hourly",                        // cada hora
};
