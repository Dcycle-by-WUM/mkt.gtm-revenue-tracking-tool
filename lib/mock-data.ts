// Datos mock realistas (basados en el naming real del brief §3) para la revisión
// de Ops mientras no estén conectados Supabase + Supermetrics + HubSpot.
// Cuando lleguen las credenciales, estas funciones se sustituyen por queries reales.

import type { ChannelMetrics } from "./kpis";
import type { HeatContact } from "./heat";

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

// ── Colas de calidad (Data Health §8.12) ───────────────────────
export const mockUnmatchedUtms = [
  "wb_taller-doble-materialidad",
  "alcance-3-con-ia",
  "esp_ mensaje_documento [mofu]", // espacio suelto
];
export const mockMissingCountry = ["alcance-3-con-ia", "wb_taller-doble-materialidad"];

// ── Spend timeline (Campaign Detail §8.4) ──────────────────────
export const mockSpendTimeline: { date: string; spend: number }[] = [
  { date: "2026-05-01", spend: 140 },
  { date: "2026-05-08", spend: 210 },
  { date: "2026-05-15", spend: 320 },
  { date: "2026-05-22", spend: 280 },
  { date: "2026-05-29", spend: 360 },
  { date: "2026-06-05", spend: 410 },
  { date: "2026-06-12", spend: 300 },
];

// ── Forecast vs objetivos (§8.5) ───────────────────────────────
export type ForecastRow = {
  channel: "LinkedIn" | "Google";
  month: string;
  country: string;
  targetSpend: number;
  actualSpend: number;
  targetPipeline: number;
  actualPipeline: number;
};
export const mockForecast: ForecastRow[] = [
  { channel: "LinkedIn", month: "2026-06", country: "ES", targetSpend: 5000, actualSpend: 4820, targetPipeline: 90000, actualPipeline: 84000 },
  { channel: "LinkedIn", month: "2026-06", country: "UK", targetSpend: 6500, actualSpend: 6100, targetPipeline: 110000, actualPipeline: 96000 },
  { channel: "Google", month: "2026-06", country: "ES", targetSpend: 3000, actualSpend: 2940, targetPipeline: 55000, actualPipeline: 61000 },
  { channel: "Google", month: "2026-06", country: "DE", targetSpend: 4000, actualSpend: 3380, targetPipeline: 60000, actualPipeline: 47000 },
];

// ── ABM — Cuentas (§8.7) ───────────────────────────────────────
export type AbmAccount = {
  name: string;
  domain: string;
  country: string;
  sdr: string;
  isTargetAbm: boolean;
  lastActivity: string;
  impactedByAds: boolean;
};
export const mockAccounts: AbmAccount[] = [
  { name: "Acme Logistics", domain: "acme-logistics.com", country: "ES", sdr: "Juanjo", isTargetAbm: true, lastActivity: "2026-06-11", impactedByAds: true },
  { name: "Northwind Foods", domain: "northwind.co.uk", country: "UK", sdr: "Paula", isTargetAbm: true, lastActivity: "2026-06-09", impactedByAds: true },
  { name: "Helios Energy", domain: "helios-energy.de", country: "DE", sdr: "Juanjo", isTargetAbm: true, lastActivity: "2026-05-30", impactedByAds: false },
  { name: "Verde Retail", domain: "verderetail.es", country: "ES", sdr: "Paula", isTargetAbm: false, lastActivity: "2026-06-12", impactedByAds: true },
];

// ── ABM — Account Timeline (§8.8) ──────────────────────────────
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

// ── Contactos para Heat Score (§H) ─────────────────────────────
export const mockHeatContacts: HeatContact[] = [
  {
    email: "laura@acme-logistics.com", company: "Acme Logistics", jobTitle: "Head of Sustainability", country: "ES", ownerSdr: "Juanjo",
    numConversionEvents: 5, recentConversionDate: "2026-06-11", recentConversionEventName: "Solicitud demo", firstConversionEventName: "Calculadora HdC",
    emailLastOpenDate: "2026-06-10", emailOpen: 12, emailClick: 6, emailReplied: 1, pageViews: 22, linkedinEngagement: "Muy alto",
    lifecycleStage: "lead", leadStatus: "MQL", emailOptout: false, numContactedNotes: 0,
  },
  {
    email: "mark@northwind.co.uk", company: "Northwind Foods", jobTitle: "ESG Manager", country: "UK", ownerSdr: "Paula",
    numConversionEvents: 3, recentConversionDate: "2026-06-06", recentConversionEventName: "Webinar Alcance 3", firstConversionEventName: "Guía 2026",
    emailLastOpenDate: "2026-06-05", emailOpen: 6, emailClick: 2, emailReplied: 0, pageViews: 9, linkedinEngagement: "Alto",
    lifecycleStage: "lead", leadStatus: "NURTURING", emailOptout: false, numContactedNotes: 0,
  },
  {
    email: "sven@helios-energy.de", company: "Helios Energy", jobTitle: "Operations Director", country: "DE", ownerSdr: "Juanjo",
    numConversionEvents: 2, recentConversionDate: "2026-05-20", recentConversionEventName: "Documento MOFU", firstConversionEventName: "Documento MOFU",
    emailLastOpenDate: "2026-05-18", emailOpen: 3, emailClick: 1, emailReplied: 0, pageViews: 5, linkedinEngagement: "Medio",
    lifecycleStage: "lead", leadStatus: "IN_SEQUENCE", emailOptout: false, numContactedNotes: 0,
  },
  {
    email: "ana@verderetail.es", company: "Verde Retail", jobTitle: "Marketing Lead", country: "ES", ownerSdr: "Paula",
    numConversionEvents: 4, recentConversionDate: "2026-04-02", recentConversionEventName: "Calculadora HdC", firstConversionEventName: "Calculadora HdC",
    emailLastOpenDate: "2026-04-01", emailOpen: 2, emailClick: 0, emailReplied: 0, pageViews: 3, linkedinEngagement: null,
    lifecycleStage: "lead", leadStatus: "NEW", emailOptout: false, numContactedNotes: 0,
  },
];

// ── Orgánico (SEO) + AEO (§10) ─────────────────────────────────
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
