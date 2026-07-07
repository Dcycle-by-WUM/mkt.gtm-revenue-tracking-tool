// Escritura de `campaigns` + `ad_spend_daily` desde fuentes paid. Fase 1:
// solo LinkedIn Ads vía CSV manual (Ad Performance Report). Idempotente por
// (source, platform_campaign_id[, date]) — subir el mismo periodo dos veces
// no duplica; subir un periodo nuevo (p.ej. julio) se suma sin tocar el resto.

import { requireSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import {
  decodeLinkedInCsv,
  parseLinkedInAdsCsv,
  aggregateLinkedInAds,
} from "@/lib/linkedin-ads";

const BATCH_SIZE = 200;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export type LinkedInIngestSummary = {
  ok: boolean;
  error?: string;
  rowsParsed: number;
  campaigns: number;
  spendRows: number;
  totalSpend: number;
  dateRange: { min: string; max: string } | null;
  countryBreakdown: Record<string, number>; // país → nº de campañas
  multiCampaigns: string[]; // nombres clasificados como "Multi" (para revisar)
};

export async function ingestLinkedInAdsCsv(file: ArrayBuffer): Promise<LinkedInIngestSummary> {
  const sb = requireSupabaseAdmin();

  const text = decodeLinkedInCsv(file);
  const rawRows = parseLinkedInAdsCsv(text);
  const agg = aggregateLinkedInAds(rawRows);

  const countryBreakdown: Record<string, number> = {};
  const multiCampaigns: string[] = [];
  for (const c of agg.campaigns) {
    countryBreakdown[c.countryParsed] = (countryBreakdown[c.countryParsed] ?? 0) + 1;
    if (c.countryParsed === "Multi") multiCampaigns.push(c.campaignName);
  }

  const runIns = await sb
    .from("sync_runs")
    .insert({ source: "linkedin", status: "running" })
    .select("id")
    .single();
  if (runIns.error || !runIns.data) {
    throw new Error(runIns.error?.message ?? "sync_runs insert failed");
  }
  const runId = runIns.data.id as string;

  try {
    // 1) Mezclar first_seen/last_seen con lo que ya hubiera en `campaigns`
    //    (no queremos que un re-upload parcial estreche la ventana conocida).
    const platformIds = agg.campaigns.map((c) => c.platformCampaignId);
    const existing = await fetchAll<{ platform_campaign_id: string; first_seen: string | null; last_seen: string | null }>(
      () =>
        sb
          .from("campaigns")
          .select("platform_campaign_id, first_seen, last_seen")
          .eq("source", "LinkedIn")
          .in("platform_campaign_id", platformIds),
    );
    const existingById = new Map(existing.map((r) => [r.platform_campaign_id, r]));

    const campaignRows = agg.campaigns.map((c) => {
      const prev = existingById.get(c.platformCampaignId);
      const firstSeen = prev?.first_seen && prev.first_seen < c.firstSeen ? prev.first_seen : c.firstSeen;
      const lastSeen = prev?.last_seen && prev.last_seen > c.lastSeen ? prev.last_seen : c.lastSeen;
      return {
        source: "LinkedIn",
        platform_campaign_id: c.platformCampaignId,
        campaign_name: c.campaignName,
        campaign_name_norm: c.campaignNameNorm,
        country_parsed: c.countryParsed,
        first_seen: firstSeen,
        last_seen: lastSeen,
      };
    });

    const idByPlatformId = new Map<string, string>();
    for (const batch of chunk(campaignRows, BATCH_SIZE)) {
      const { data, error } = await sb
        .from("campaigns")
        .upsert(batch, { onConflict: "source,platform_campaign_id" })
        .select("id, platform_campaign_id");
      if (error) throw new Error(`upsert campaigns → ${error.message}`);
      for (const r of data ?? []) idByPlatformId.set(r.platform_campaign_id, r.id);
    }

    // 2) ad_spend_daily — requiere campaign_id (uuid) para que la vista
    //    kpi_by_campaign_month (join por campaign_id) recoja el spend.
    const spendRows = agg.spendRows.map((s) => ({
      source: "LinkedIn",
      platform_campaign_id: s.platformCampaignId,
      date: s.date,
      campaign_id: idByPlatformId.get(s.platformCampaignId) ?? null,
      spend: s.spend,
      currency: s.currency,
      impressions: s.impressions,
      clicks: s.clicks,
      synced_at: new Date().toISOString(),
    }));

    let upserted = 0;
    for (const batch of chunk(spendRows, BATCH_SIZE)) {
      const { error } = await sb
        .from("ad_spend_daily")
        .upsert(batch, { onConflict: "source,platform_campaign_id,date" });
      if (error) throw new Error(`upsert ad_spend_daily → ${error.message}`);
      upserted += batch.length;
    }

    try {
      await sb.rpc("refresh_kpi_views");
    } catch (e) {
      console.error(`[linkedin-ads] refresh_kpi_views failed: ${e instanceof Error ? e.message : e}`);
    }

    await sb
      .from("sync_runs")
      .update({
        status: "ok",
        rows: upserted,
        finished_at: new Date().toISOString(),
        last_covered_date: agg.dateRange?.max ?? null,
      })
      .eq("id", runId);

    return {
      ok: true,
      rowsParsed: rawRows.length,
      campaigns: agg.campaigns.length,
      spendRows: upserted,
      totalSpend: agg.totalSpend,
      dateRange: agg.dateRange,
      countryBreakdown,
      multiCampaigns,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb
      .from("sync_runs")
      .update({ status: "error", finished_at: new Date().toISOString() })
      .eq("id", runId);
    return {
      ok: false,
      error: msg,
      rowsParsed: rawRows.length,
      campaigns: agg.campaigns.length,
      spendRows: 0,
      totalSpend: agg.totalSpend,
      dateRange: agg.dateRange,
      countryBreakdown,
      multiCampaigns,
    };
  }
}
