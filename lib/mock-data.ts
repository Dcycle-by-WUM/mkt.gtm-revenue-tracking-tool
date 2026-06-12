// Dataset de ejemplo + tipos + helpers de filtrado/agrupación.
// Incluye dimensión de MES para poder filtrar por país y mes en cada pantalla.
// En producción esto se sustituye por queries a Supabase.

import type { ChannelMetrics } from "./kpis";
import type { HeatContact } from "./heat";

export const IS_MOCK = true;

export type Channel = "LinkedIn" | "Google";

export type CampaignRow = ChannelMetrics & {
  channel: Channel;
  campaign: string;
  campaignGroup: string | null; // país se deriva del GRUPO en LinkedIn (§7.3)
  country: string;
  month: string; // YYYY-MM
};

export const MONTHS = ["2026-04", "2026-05", "2026-06"] as const;
export const CHANNELS: Channel[] = ["LinkedIn", "Google"];
export const NO_COUNTRY = "Sin país / Multi";

type BaseCampaign = Omit<CampaignRow, "month">;

const baseCampaigns: BaseCampaign[] = [
  { channel: "LinkedIn", campaign: "esp_mensaje_españa_documento [mofu]", campaignGroup: "INT_ESP_2026", country: "ES", spend: 4820, impressions: 312400, clicks: 1980, leads: 142, mql: 96, sql: 18, pipeline: 84000, closedWon: 21000 },
  { channel: "LinkedIn", campaign: "int_doc_uk_errores_tiermulti [mofu]", campaignGroup: "INT_MULTI_UK_2026", country: "UK", spend: 6100, impressions: 401200, clicks: 2210, leads: 118, mql: 71, sql: 12, pipeline: 96000, closedWon: 0 },
  { channel: "Google", campaign: "carbon-footprint-software-de", campaignGroup: null, country: "DE", spend: 3380, impressions: 88900, clicks: 3120, leads: 88, mql: 52, sql: 9, pipeline: 47000, closedWon: 12000 },
  { channel: "Google", campaign: "lm_calculadora-hdc-2025-es", campaignGroup: null, country: "ES", spend: 2940, impressions: 71200, clicks: 2680, leads: 134, mql: 88, sql: 14, pipeline: 61000, closedWon: 18000 },
  { channel: "Google", campaign: "alcance-3-con-ia", campaignGroup: null, country: NO_COUNTRY, spend: 1510, impressions: 39800, clicks: 1190, leads: 41, mql: 22, sql: 3, pipeline: 15000, closedWon: 0 },
  { channel: "Google", campaign: "wb_taller-doble-materialidad", campaignGroup: null, country: NO_COUNTRY, spend: 980, impressions: 24100, clicks: 720, leads: 26, mql: 12, sql: 1, pipeline: 6000, closedWon: 0 },
];

// Factor por mes (jun = baseline 1.0, para que el mes actual cuadre con el preview).
const monthFactor: Record<string, number> = { "2026-04": 0.8, "2026-05": 0.9, "2026-06": 1.0 };
const sc = (v: number, f: number) => Math.round(v * f);

export const mockCampaigns: CampaignRow[] = baseCampaigns.flatMap((b) =>
  MONTHS.map((month) => {
    const f = monthFactor[month];
    return {
      ...b,
      month,
      spend: sc(b.spend, f), impressions: sc(b.impressions, f), clicks: sc(b.clicks, f),
      leads: sc(b.leads, f), mql: sc(b.mql, f), sql: sc(b.sql, f),
      pipeline: sc(b.pipeline, f), closedWon: sc(b.closedWon, f),
    };
  }),
);

// ── Helpers de métricas ────────────────────────────────────────
export const emptyMetrics = (): ChannelMetrics => ({
  spend: 0, impressions: 0, clicks: 0, leads: 0, mql: 0, sql: 0, pipeline: 0, closedWon: 0,
});

export function sumMetrics<T extends ChannelMetrics>(rows: T[]): ChannelMetrics {
  return rows.reduce((a, r) => {
    a.spend += r.spend; a.impressions += r.impressions; a.clicks += r.clicks;
    a.leads += r.leads; a.mql += r.mql; a.sql += r.sql;
    a.pipeline += r.pipeline; a.closedWon += r.closedWon;
    return a;
  }, emptyMetrics());
}

/** Compat: usado por pantallas que sumaban filas. */
export const totals = sumMetrics;

// ── Filtros (país / mes / canal) ───────────────────────────────
export type Filters = { country: string; month: string; channel: string };
export const emptyFilters: Filters = { country: "", month: "", channel: "" };

export function filterCampaigns(rows: CampaignRow[], f: Filters): CampaignRow[] {
  return rows.filter(
    (r) =>
      (!f.country || r.country === f.country) &&
      (!f.month || r.month === f.month) &&
      (!f.channel || r.channel === f.channel),
  );
}

export const countriesOf = (rows: CampaignRow[]) => [...new Set(rows.map((r) => r.country))].sort();

// ── Overrides de país (editables desde Explorer, §7.4) ─────────
export const OVERRIDES_KEY = "gtm.countryOverrides.v1";
export type CountryOverrides = Record<string, string>; // campaign -> country
export function applyOverrides(rows: CampaignRow[], ov: CountryOverrides): CampaignRow[] {
  return rows.map((r) => (ov[r.campaign] ? { ...r, country: ov[r.campaign] } : r));
}

// ── Agrupación (pivot) ─────────────────────────────────────────
export type Dimension = "channel" | "country" | "campaign" | "month";
export const DIMENSION_LABELS: Record<Dimension, string> = {
  channel: "Canal", country: "País", campaign: "Campaña", month: "Mes",
};

export function groupBy(rows: CampaignRow[], dim: Dimension): [string, ChannelMetrics][] {
  const map = new Map<string, ChannelMetrics>();
  for (const r of rows) {
    const key = String(r[dim]);
    const acc = map.get(key) ?? emptyMetrics();
    acc.spend += r.spend; acc.impressions += r.impressions; acc.clicks += r.clicks;
    acc.leads += r.leads; acc.mql += r.mql; acc.sql += r.sql;
    acc.pipeline += r.pipeline; acc.closedWon += r.closedWon;
    map.set(key, acc);
  }
  return [...map.entries()].sort((a, b) => b[1].spend - a[1].spend);
}

// Pivot multi-dimensión: agrupa por la combinación ordenada de dimensiones.
export type MultiGroup = { keys: string[]; metrics: ChannelMetrics };
export function groupByMulti(rows: CampaignRow[], dims: Dimension[]): MultiGroup[] {
  if (dims.length === 0) return [{ keys: [], metrics: sumMetrics(rows) }];
  const map = new Map<string, MultiGroup>();
  for (const r of rows) {
    const keys = dims.map((d) => String(r[d]));
    const k = keys.join("∣");
    const g = map.get(k) ?? { keys, metrics: emptyMetrics() };
    g.metrics.spend += r.spend; g.metrics.impressions += r.impressions; g.metrics.clicks += r.clicks;
    g.metrics.leads += r.leads; g.metrics.mql += r.mql; g.metrics.sql += r.sql;
    g.metrics.pipeline += r.pipeline; g.metrics.closedWon += r.closedWon;
    map.set(k, g);
  }
  return [...map.values()].sort((a, b) => b.metrics.spend - a.metrics.spend);
}

// ── Estado de fuentes (Data Health §8.12) ──────────────────────
export type SourceHealth = { source: string; method: string; status: "ok" | "pending" | "blocked"; detail: string };
export const mockSourceHealth: SourceHealth[] = [
  { source: "LinkedIn Ads (LIA)", method: "Supermetrics API", status: "pending", detail: "Autenticado en Supermetrics; falta token de API en env." },
  { source: "Google Ads (AW)", method: "Supermetrics API", status: "pending", detail: "Autenticado en Supermetrics; falta token de API en env." },
  { source: "HubSpot (CRM)", method: "API privada", status: "blocked", detail: "Bloqueado: API key pendiente (§12.1)." },
  { source: "Supabase (datos + auth)", method: "Postgres + RLS", status: "pending", detail: "Proyecto Supabase por crear." },
];

export const mockUnmatchedUtms = ["wb_taller-doble-materialidad", "alcance-3-con-ia", "esp_ mensaje_documento [mofu]"];
export const mockMissingCountry = ["alcance-3-con-ia", "wb_taller-doble-materialidad"];

export const mockSpendTimeline: { date: string; spend: number }[] = [
  { date: "2026-05-01", spend: 140 }, { date: "2026-05-08", spend: 210 }, { date: "2026-05-15", spend: 320 },
  { date: "2026-05-22", spend: 280 }, { date: "2026-05-29", spend: 360 }, { date: "2026-06-05", spend: 410 }, { date: "2026-06-12", spend: 300 },
];

// ── Forecast vs objetivos (§8.5) ───────────────────────────────
// Solo los OBJETIVOS son manuales/editables. El "real" (spend y pipeline) se
// CALCULA de los datos reales (Ads/HubSpot con atribución) y no se edita.
export type ForecastRow = {
  channel: Channel; month: string; country: string;
  targetSpend: number; targetPipeline: number;
};
export const mockForecast: ForecastRow[] = [
  { channel: "LinkedIn", month: "2026-06", country: "ES", targetSpend: 5000, targetPipeline: 90000 },
  { channel: "LinkedIn", month: "2026-06", country: "UK", targetSpend: 6500, targetPipeline: 110000 },
  { channel: "Google", month: "2026-06", country: "ES", targetSpend: 3000, targetPipeline: 55000 },
  { channel: "Google", month: "2026-06", country: "DE", targetSpend: 4000, targetPipeline: 60000 },
];

// "Real" calculado del dataset (no editable): suma de spend/pipeline de las
// campañas que casan por canal + mes + país (atribución).
export function forecastActuals(
  campaigns: CampaignRow[],
  channel: Channel, month: string, country: string,
): { spend: number; pipeline: number } {
  const m = campaigns.filter((r) => r.channel === channel && r.month === month && r.country === country);
  return { spend: m.reduce((s, r) => s + r.spend, 0), pipeline: m.reduce((s, r) => s + r.pipeline, 0) };
}

// ── ABM ────────────────────────────────────────────────────────
export type AbmAccount = {
  name: string; domain: string; country: string; sdr: string;
  isTargetAbm: boolean; lastActivity: string; impactedByAds: boolean;
};
export const mockAccounts: AbmAccount[] = [
  { name: "Acme Logistics", domain: "acme-logistics.com", country: "ES", sdr: "Juanjo", isTargetAbm: true, lastActivity: "2026-06-11", impactedByAds: true },
  { name: "Northwind Foods", domain: "northwind.co.uk", country: "UK", sdr: "Paula", isTargetAbm: true, lastActivity: "2026-06-09", impactedByAds: true },
  { name: "Helios Energy", domain: "helios-energy.de", country: "DE", sdr: "Juanjo", isTargetAbm: true, lastActivity: "2026-05-30", impactedByAds: false },
  { name: "Verde Retail", domain: "verderetail.es", country: "ES", sdr: "Paula", isTargetAbm: false, lastActivity: "2026-06-12", impactedByAds: true },
];
export const SDRS = ["Juanjo", "Paula"];

export type TimelineEvent = { date: string; type: string; detail: string };
export const mockTimeline: { account: string; events: TimelineEvent[] } = {
  account: "Acme Logistics",
  events: [
    { date: "2026-05-15", type: "Ad", detail: "Impactada por LinkedIn Ads (grupo INT_ESP_2026)" },
    { date: "2026-05-20", type: "Descarga", detail: "Descargó 'Calculadora HdC 2025'" },
    { date: "2026-05-28", type: "Email", detail: "Abrió secuencia outbound (3 opens)" },
    { date: "2026-06-04", type: "Web", detail: "Visitó /pricing (8 page views)" },
    { date: "2026-06-09", type: "Webinar", detail: "Asistió a webinar Alcance 3" },
    { date: "2026-06-11", type: "Demo", detail: "Solicitó demo" },
  ],
};

export const mockHeatContacts: HeatContact[] = [
  { email: "laura@acme-logistics.com", company: "Acme Logistics", jobTitle: "Head of Sustainability", country: "ES", ownerSdr: "Juanjo", numConversionEvents: 5, recentConversionDate: "2026-06-11", recentConversionEventName: "Solicitud demo", firstConversionEventName: "Calculadora HdC", emailLastOpenDate: "2026-06-10", emailOpen: 12, emailClick: 6, emailReplied: 1, pageViews: 22, linkedinEngagement: "Muy alto", lifecycleStage: "lead", leadStatus: "MQL", emailOptout: false, numContactedNotes: 0 },
  { email: "mark@northwind.co.uk", company: "Northwind Foods", jobTitle: "ESG Manager", country: "UK", ownerSdr: "Paula", numConversionEvents: 3, recentConversionDate: "2026-06-06", recentConversionEventName: "Webinar Alcance 3", firstConversionEventName: "Guía 2026", emailLastOpenDate: "2026-06-05", emailOpen: 6, emailClick: 2, emailReplied: 0, pageViews: 9, linkedinEngagement: "Alto", lifecycleStage: "lead", leadStatus: "NURTURING", emailOptout: false, numContactedNotes: 0 },
  { email: "sven@helios-energy.de", company: "Helios Energy", jobTitle: "Operations Director", country: "DE", ownerSdr: "Juanjo", numConversionEvents: 2, recentConversionDate: "2026-05-20", recentConversionEventName: "Documento MOFU", firstConversionEventName: "Documento MOFU", emailLastOpenDate: "2026-05-18", emailOpen: 3, emailClick: 1, emailReplied: 0, pageViews: 5, linkedinEngagement: "Medio", lifecycleStage: "lead", leadStatus: "IN_SEQUENCE", emailOptout: false, numContactedNotes: 0 },
  { email: "ana@verderetail.es", company: "Verde Retail", jobTitle: "Marketing Lead", country: "ES", ownerSdr: "Paula", numConversionEvents: 4, recentConversionDate: "2026-04-02", recentConversionEventName: "Calculadora HdC", firstConversionEventName: "Calculadora HdC", emailLastOpenDate: "2026-04-01", emailOpen: 2, emailClick: 0, emailReplied: 0, pageViews: 3, linkedinEngagement: null, lifecycleStage: "lead", leadStatus: "NEW", emailOptout: false, numContactedNotes: 0 },
];

export const mockSeoKpis = [
  { kpi: "Tráfico orgánico non-branded", value: "18.420 sesiones", source: "GSC + GA4" },
  { kpi: "Domain Authority (DA)", value: "47 (+2)", source: "Moz/Ahrefs" },
  { kpi: "Keywords estratégicas en Top 3", value: "34", source: "GSC / rank tracker" },
  { kpi: "Leads orgánicos (MQL)", value: "61", source: "HubSpot" },
  { kpi: "Pipeline SEO €", value: "72.000 €", source: "HubSpot" },
];
export const mockAeoKpis = [
  { kpi: "AI Visibility", value: "23 %", source: "Plataforma AI-visibility" },
  { kpi: "AI Share of Voice", value: "12 %", source: "Plataforma AI-visibility" },
  { kpi: "Leads desde IA (AI_REFERRALS)", value: "14", source: "HubSpot" },
  { kpi: "Pipeline desde IA €", value: "21.000 €", source: "HubSpot" },
  { kpi: "Bing — impresiones", value: "44.100", source: "Bing WMT" },
];
