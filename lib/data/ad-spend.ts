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
  type LinkedInAdsAggregate,
} from "@/lib/linkedin-ads";

const BATCH_SIZE = 500;

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

// Compat: ruta legacy que recibe el CSV crudo y lo parsea en el servidor.
// El flujo actual parsea/agrega en el NAVEGADOR (ver linkedin-upload-client)
// y llama a ingestLinkedInAggregate con el resultado — mucho más pequeño que
// el CSV a nivel Ad y sin depender de límites de payload de la plataforma.
export async function ingestLinkedInAdsCsv(file: ArrayBuffer): Promise<LinkedInIngestSummary> {
  const text = decodeLinkedInCsv(file);
  const rawRows = parseLinkedInAdsCsv(text);
  const agg = aggregateLinkedInAds(rawRows);
  return ingestLinkedInAggregate(agg, rawRows.length);
}

// El run de `sync_runs` se crea ANTES de tocar datos — el cliente hace
// polling contra esta tabla como red de seguridad si pierde la respuesta
// HTTP, y necesita encontrar una fila enseguida y verla resolverse a
// "ok"/"error".
export async function ingestLinkedInAggregate(
  agg: LinkedInAdsAggregate,
  rowsParsed: number,
): Promise<LinkedInIngestSummary> {
  const sb = requireSupabaseAdmin();

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
    const countryBreakdown: Record<string, number> = {};
    const multiCampaigns: string[] = [];
    for (const c of agg.campaigns) {
      countryBreakdown[c.countryParsed] = (countryBreakdown[c.countryParsed] ?? 0) + 1;
      if (c.countryParsed === "Multi") multiCampaigns.push(c.campaignName);
    }

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
    const campaignUpserts = await Promise.all(
      chunk(campaignRows, BATCH_SIZE).map((batch) =>
        sb.from("campaigns").upsert(batch, { onConflict: "source,platform_campaign_id" }).select("id, platform_campaign_id"),
      ),
    );
    for (const { data, error } of campaignUpserts) {
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

    const spendBatches = chunk(spendRows, BATCH_SIZE);
    const spendUpserts = await Promise.all(
      spendBatches.map((batch) =>
        sb.from("ad_spend_daily").upsert(batch, { onConflict: "source,platform_campaign_id,date" }),
      ),
    );
    let upserted = 0;
    spendUpserts.forEach(({ error }, i) => {
      if (error) throw new Error(`upsert ad_spend_daily → ${error.message}`);
      upserted += spendBatches[i].length;
    });

    // El run se marca "ok" ANTES del refresh de vistas: los datos ya están
    // upserted, y si la plataforma mata la función a mitad del refresh no
    // queda un run "running" huérfano que confunda al polling del cliente.
    await sb
      .from("sync_runs")
      .update({
        status: "ok",
        rows: upserted,
        finished_at: new Date().toISOString(),
        last_covered_date: agg.dateRange?.max ?? null,
      })
      .eq("id", runId);

    try {
      await sb.rpc("refresh_kpi_views");
    } catch (e) {
      console.error(`[linkedin-ads] refresh_kpi_views failed: ${e instanceof Error ? e.message : e}`);
    }

    return {
      ok: true,
      rowsParsed,
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
      .update({ status: "error", error_message: msg, finished_at: new Date().toISOString() })
      .eq("id", runId);
    // No hay nada fiable que devolver aquí más allá del error. El polling
    // del cliente lee `sync_runs.error_message`.
    return {
      ok: false,
      error: msg,
      rowsParsed: 0,
      campaigns: 0,
      spendRows: 0,
      totalSpend: 0,
      dateRange: null,
      countryBreakdown: {},
      multiCampaigns: [],
    };
  }
}
