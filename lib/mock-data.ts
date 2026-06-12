// Datos mock realistas (basados en el naming real del brief §3) para la revisión
// de Ops mientras no estén conectados Supabase + Supermetrics + HubSpot.
// Cuando lleguen las credenciales, estas funciones se sustituyen por queries reales.

import type { ChannelMetrics } from "./kpis";

export type CampaignRow = ChannelMetrics & {
  channel: "LinkedIn" | "Google";
  campaign: string;
  campaignGroup: string | null; // país se deriva del GRUPO en LinkedIn (§7.3)
  country: string;
};

// Marca de que son datos de ejemplo, no reales.
export const IS_MOCK = true;

export const mockCampaigns: CampaignRow[] = [
  {
    channel: "LinkedIn",
    campaign: "esp_mensaje_españa_documento [mofu]",
    campaignGroup: "INT_ESP_2026",
    country: "ES",
    spend: 4820,
    impressions: 312400,
    clicks: 1980,
    leads: 142,
    mql: 96,
    sql: 18,
    pipeline: 84000,
    closedWon: 21000,
  },
  {
    channel: "LinkedIn",
    campaign: "int_doc_uk_errores_tiermulti [mofu]",
    campaignGroup: "INT_MULTI_UK_2026",
    country: "UK",
    spend: 6100,
    impressions: 401200,
    clicks: 2210,
    leads: 118,
    mql: 71,
    sql: 12,
    pipeline: 96000,
    closedWon: 0,
  },
  {
    channel: "Google",
    campaign: "carbon-footprint-software-de",
    campaignGroup: null,
    country: "DE",
    spend: 3380,
    impressions: 88900,
    clicks: 3120,
    leads: 88,
    mql: 52,
    sql: 9,
    pipeline: 47000,
    closedWon: 12000,
  },
  {
    channel: "Google",
    campaign: "lm_calculadora-hdc-2025-es",
    campaignGroup: null,
    country: "ES",
    spend: 2940,
    impressions: 71200,
    clicks: 2680,
    leads: 134,
    mql: 88,
    sql: 14,
    pipeline: 61000,
    closedWon: 18000,
  },
  {
    channel: "Google",
    campaign: "alcance-3-con-ia",
    campaignGroup: null,
    country: "Sin país / Multi",
    spend: 1510,
    impressions: 39800,
    clicks: 1190,
    leads: 41,
    mql: 22,
    sql: 3,
    pipeline: 15000,
    closedWon: 0,
  },
];

export function totals(rows: CampaignRow[]): ChannelMetrics {
  return rows.reduce<ChannelMetrics>(
    (acc, r) => ({
      spend: acc.spend + r.spend,
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      leads: acc.leads + r.leads,
      mql: acc.mql + r.mql,
      sql: acc.sql + r.sql,
      pipeline: acc.pipeline + r.pipeline,
      closedWon: acc.closedWon + r.closedWon,
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0, mql: 0, sql: 0, pipeline: 0, closedWon: 0 },
  );
}

// Estado de las fuentes de datos para la pantalla Data Health (§8.12).
export type SourceHealth = {
  source: string;
  method: string;
  status: "ok" | "pending" | "blocked";
  detail: string;
};

export const mockSourceHealth: SourceHealth[] = [
  { source: "LinkedIn Ads (LIA)", method: "Supermetrics API", status: "pending", detail: "Autenticado en Supermetrics; falta token de API en env." },
  { source: "Google Ads (AW)", method: "Supermetrics API", status: "pending", detail: "Autenticado en Supermetrics; falta token de API en env." },
  { source: "HubSpot (CRM)", method: "API privada", status: "blocked", detail: "Bloqueado: API key pendiente (§12.1)." },
  { source: "Supabase (datos + auth)", method: "Postgres + RLS", status: "pending", detail: "Proyecto Supabase por crear." },
];
