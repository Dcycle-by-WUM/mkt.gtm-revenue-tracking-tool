// Sync diario de paid (LinkedIn Ads + Google Ads) vía Supermetrics → Supabase.
// PRD §5 / §6. Idempotente: upsert por (source, platform_campaign_id, date).
// Refresca una ventana de los últimos 14 días para capturar correcciones de la
// plataforma.

import type { Config } from "@netlify/functions";
import { fetchPaidSpend, type PaidSpendRow } from "@/lib/supermetrics";
import { requireSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeUtm } from "@/lib/matching";
import { deriveCountry } from "@/lib/country";

const WINDOW_DAYS = 14;

async function startedRun(source: string): Promise<{ id: string }> {
  const sb = requireSupabaseAdmin();
  const r = await sb
    .from("sync_runs")
    .insert({ source, status: "running" })
    .select("id")
    .single();
  if (r.error || !r.data) throw r.error ?? new Error("sync_runs insert failed");
  return r.data as { id: string };
}

async function finishRun(id: string, ok: boolean, rows: number, lastCovered: string): Promise<void> {
  const sb = requireSupabaseAdmin();
  await sb
    .from("sync_runs")
    .update({
      status: ok ? "ok" : "error",
      rows,
      last_covered_date: lastCovered,
      finished_at: new Date().toISOString(),
    })
    .eq("id", id);
}

async function upsertCampaigns(rows: PaidSpendRow[]): Promise<Map<string, string>> {
  const sb = requireSupabaseAdmin();
  // Una entrada por (source, platform_campaign_id).
  const byKey = new Map<string, PaidSpendRow>();
  for (const r of rows) {
    byKey.set(`${r.source}:${r.platformCampaignId}`, r);
  }

  // Resolver país para cada campaña.
  const records = await Promise.all(
    [...byKey.values()].map(async (r) => {
      const c = await deriveCountry(r.source, r.campaignName, r.campaignGroupName);
      return {
        source: r.source,
        platform_campaign_id: r.platformCampaignId,
        campaign_group_name: r.campaignGroupName,
        campaign_name: r.campaignName,
        campaign_name_norm: normalizeUtm(r.campaignName),
        country_parsed: c.country,
        last_seen: r.date,
      };
    }),
  );

  const { data } = await sb
    .from("campaigns")
    .upsert(records, { onConflict: "source,platform_campaign_id" })
    .select("id, source, platform_campaign_id");

  const idMap = new Map<string, string>();
  for (const c of (data ?? []) as { id: string; source: string; platform_campaign_id: string }[]) {
    idMap.set(`${c.source}:${c.platform_campaign_id}`, c.id);
  }
  return idMap;
}

async function upsertSpend(rows: PaidSpendRow[], idMap: Map<string, string>): Promise<void> {
  const sb = requireSupabaseAdmin();
  const records = rows.map((r) => ({
    source: r.source,
    platform_campaign_id: r.platformCampaignId,
    date: r.date,
    campaign_id: idMap.get(`${r.source}:${r.platformCampaignId}`) ?? null,
    campaign_group_name: r.campaignGroupName,
    spend: r.spend,
    currency: r.currency || "EUR",
    impressions: r.impressions,
    clicks: r.clicks,
    synced_at: new Date().toISOString(),
  }));

  // Chunk de 500 por seguridad.
  for (let i = 0; i < records.length; i += 500) {
    const batch = records.slice(i, i + 500);
    await sb.from("ad_spend_daily").upsert(batch, {
      onConflict: "source,platform_campaign_id,date",
    });
  }
}

async function refreshViews(): Promise<void> {
  const sb = requireSupabaseAdmin();
  try { await sb.rpc("refresh_kpi_views"); } catch { /* ignore */ }
}

export default async (): Promise<Response> => {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - WINDOW_DAYS);
  const startDate = start.toISOString().slice(0, 10);
  const endDate = today.toISOString().slice(0, 10);

  const results: { source: string; rows: number; error?: string }[] = [];

  for (const source of ["LinkedIn", "Google"] as const) {
    const run = await startedRun(source === "LinkedIn" ? "linkedin" : "google_ads");
    try {
      const rows = await fetchPaidSpend({ source, startDate, endDate });
      const idMap = await upsertCampaigns(rows);
      await upsertSpend(rows, idMap);
      await finishRun(run.id, true, rows.length, endDate);
      results.push({ source, rows: rows.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await finishRun(run.id, false, 0, endDate);
      results.push({ source, rows: 0, error: msg });
    }
  }

  await refreshViews();

  return new Response(JSON.stringify({ window: { startDate, endDate }, results }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const config: Config = {
  schedule: "@daily",                         // 00:00 UTC cada día
};
