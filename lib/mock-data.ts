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

// Mes anterior dentro de MONTHS (para tablas comparativas periodo vs periodo).
export function prevMonth(month: string): string | null {
  const i = MONTHS.indexOf(month as (typeof MONTHS)[number]);
  return i > 0 ? MONTHS[i - 1] : null;
}

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

// ── SEO orgánico + AEO (Brief §10, docs/SEO-ORGANICO.md) ────────
// DA/Domain Authority sigue como KPI aparte (herramienta a confirmar, §12);
// el resto sale de conectores nativos GSC/GA4/Bing + HubSpot (no Supermetrics).
import type { Intent, SeoKeyword, SeoPage, AiEngine, AiVisibilityPrompt, OrganicDemoLead } from "./seo";

export const mockDomainAuthority = { value: 47, delta: 2, source: "Moz/Ahrefs (herramienta a confirmar, §12)" };

// Keywords estratégicas × 3 meses (posición mejorando abr→jun para narrativa demo).
const seoKeywordBase: {
  keyword: string; intent: Intent; targetUrl: string; rankingUrl: string;
  isBranded: boolean; isStrategic: boolean; country: string;
  position: [number, number, number]; clicks: [number, number, number];
  impressions: [number, number, number]; organicDemos: [number, number, number];
}[] = [
  { keyword: "software gestión huella de carbono", intent: "transactional", targetUrl: "/producto", rankingUrl: "/producto", isBranded: false, isStrategic: true, country: "ES", position: [4.1, 3.2, 2.4], clicks: [420, 510, 610], impressions: [9800, 10400, 11200], organicDemos: [4, 6, 8] },
  { keyword: "calculadora de huella de carbono", intent: "transactional", targetUrl: "/pricing", rankingUrl: "/blog/que-es-huella-de-carbono", isBranded: false, isStrategic: true, country: "ES", position: [5.0, 4.6, 4.1], clicks: [720, 810, 890], impressions: [19500, 20200, 21000], organicDemos: [1, 1, 2] },
  { keyword: "software doble materialidad", intent: "transactional", targetUrl: "/producto/doble-materialidad", rankingUrl: "/blog/doble-materialidad-guia", isBranded: false, isStrategic: true, country: "UK", position: [8.4, 7.5, 6.8], clicks: [180, 220, 260], impressions: [6800, 7100, 7500], organicDemos: [0, 1, 1] },
  { keyword: "dcycle", intent: "branded", targetUrl: "/", rankingUrl: "/", isBranded: true, isStrategic: false, country: "ES", position: [1.1, 1.0, 1.0], clicks: [1900, 2050, 2200], impressions: [2400, 2500, 2600], organicDemos: [9, 10, 12] },
  { keyword: "software reporting csrd", intent: "transactional", targetUrl: "/producto/csrd", rankingUrl: "/producto/csrd", isBranded: false, isStrategic: true, country: "UK", position: [4.0, 3.6, 3.2], clicks: [210, 260, 300], impressions: [6100, 6600, 7000], organicDemos: [2, 3, 5] },
  { keyword: "alcance 3 emisiones software", intent: "informational", targetUrl: "/producto", rankingUrl: "/blog/alcance-3-que-es", isBranded: false, isStrategic: true, country: "DE", position: [5.9, 5.7, 5.5], clicks: [310, 330, 350], impressions: [8900, 9100, 9300], organicDemos: [0, 0, 1] },
];
export const mockSeoKeywords: SeoKeyword[] = seoKeywordBase.flatMap((k) =>
  MONTHS.map((month, i) => ({
    keyword: k.keyword, intent: k.intent, targetUrl: k.targetUrl, rankingUrl: k.rankingUrl,
    position: k.position[i], clicks: k.clicks[i], impressions: k.impressions[i], organicDemos: k.organicDemos[i],
    isBranded: k.isBranded, isStrategic: k.isStrategic, country: k.country, month,
  })),
);

// URLs/landings con su rendimiento orgánico × 3 meses.
const seoPageBase: {
  url: string; isTransactional: boolean; country: string;
  position: [number, number, number]; clicks: [number, number, number];
  impressions: [number, number, number]; organicSessions: [number, number, number]; organicDemos: [number, number, number];
}[] = [
  { url: "/producto", isTransactional: true, country: "ES", position: [3.8, 3.1, 2.4], clicks: [420, 510, 610], impressions: [9800, 10400, 11200], organicSessions: [380, 460, 540], organicDemos: [4, 6, 8] },
  { url: "/producto/csrd", isTransactional: true, country: "UK", position: [4.5, 3.9, 3.2], clicks: [210, 260, 300], impressions: [6100, 6600, 7000], organicSessions: [190, 230, 270], organicDemos: [2, 3, 5] },
  { url: "/pricing", isTransactional: true, country: "ES", position: [6.2, 5.4, 4.6], clicks: [150, 180, 210], impressions: [4200, 4500, 4900], organicSessions: [140, 165, 190], organicDemos: [3, 4, 5] },
  { url: "/blog/que-es-huella-de-carbono", isTransactional: false, country: "ES", position: [3.9, 4.0, 4.1], clicks: [890, 910, 930], impressions: [21000, 21500, 22000], organicSessions: [820, 840, 860], organicDemos: [1, 1, 2] },
  { url: "/blog/doble-materialidad-guia", isTransactional: false, country: "UK", position: [7.1, 6.9, 6.8], clicks: [240, 250, 260], impressions: [7200, 7300, 7500], organicSessions: [210, 220, 230], organicDemos: [0, 1, 1] },
  { url: "/producto/doble-materialidad", isTransactional: true, country: "UK", position: [9.5, 8.2, 6.8], clicks: [60, 80, 110], impressions: [2100, 2400, 2800], organicSessions: [55, 72, 98], organicDemos: [0, 1, 2] },
];
export const mockSeoPages: SeoPage[] = seoPageBase.flatMap((p) =>
  MONTHS.map((month, i) => ({
    url: p.url, isTransactional: p.isTransactional, position: p.position[i], clicks: p.clicks[i],
    impressions: p.impressions[i], organicSessions: p.organicSessions[i], organicDemos: p.organicDemos[i],
    country: p.country, month,
  })),
);

// Banco de prompts estratégicos → cita, por motor. Copilot prioritario (motor
// que usan la mayoría de clientes Dcycle; se nutre del índice de Bing).
const aiPromptBase: {
  prompt: string; engine: AiEngine; country: string;
  appearsDcycle: [boolean, boolean, boolean];
  citedUrl: [string | null, string | null, string | null];
  competitorsCited: [string[], string[], string[]];
}[] = [
  { prompt: "mejor software de huella de carbono para empresas", engine: "copilot", country: "ES",
    appearsDcycle: [false, true, true], citedUrl: [null, "dcycle.io/producto", "dcycle.io/producto"],
    competitorsCited: [["Persefoni", "Watershed"], ["Persefoni"], ["Persefoni"]] },
  { prompt: "software reporting CSRD recomendado", engine: "copilot", country: "UK",
    appearsDcycle: [false, false, true], citedUrl: [null, null, "dcycle.io/producto/csrd"],
    competitorsCited: [["Sphera", "Watershed"], ["Sphera", "Watershed"], ["Sphera"]] },
  { prompt: "herramientas para calcular alcance 3 (scope 3)", engine: "copilot", country: "ES",
    appearsDcycle: [true, true, true], citedUrl: ["dcycle.io/blog/alcance-3-que-es", "dcycle.io/blog/alcance-3-que-es", "dcycle.io/producto"],
    competitorsCited: [["Watershed"], [], []] },
  { prompt: "software doble materialidad CSRD", engine: "copilot", country: "DE",
    appearsDcycle: [false, false, false], citedUrl: [null, null, null],
    competitorsCited: [["Sphera", "Persefoni"], ["Sphera", "Persefoni"], ["Sphera"]] },
  { prompt: "best carbon accounting software for enterprise", engine: "chatgpt", country: "UK",
    appearsDcycle: [false, true, true], citedUrl: [null, "dcycle.io/producto", "dcycle.io/producto"],
    competitorsCited: [["Watershed", "Persefoni"], ["Watershed"], ["Watershed"]] },
  { prompt: "CSRD reporting software comparison", engine: "chatgpt", country: "UK",
    appearsDcycle: [false, false, false], citedUrl: [null, null, null],
    competitorsCited: [["Sphera", "Workiva"], ["Sphera", "Workiva"], ["Workiva"]] },
  { prompt: "mejor software huella de carbono", engine: "perplexity", country: "ES",
    appearsDcycle: [true, true, true], citedUrl: ["dcycle.io/producto", "dcycle.io/producto", "dcycle.io/producto"],
    competitorsCited: [["Persefoni"], ["Persefoni"], []] },
  { prompt: "double materiality assessment tools", engine: "perplexity", country: "DE",
    appearsDcycle: [false, false, true], citedUrl: [null, null, "dcycle.io/producto/doble-materialidad"],
    competitorsCited: [["Sphera"], ["Sphera"], ["Sphera"]] },
  { prompt: "carbon footprint software for SMEs", engine: "gemini", country: "ES",
    appearsDcycle: [false, false, false], citedUrl: [null, null, null],
    competitorsCited: [["Watershed", "Persefoni"], ["Watershed"], ["Watershed"]] },
];
export const mockAiVisibilityPrompts: AiVisibilityPrompt[] = aiPromptBase.flatMap((p) =>
  MONTHS.map((month, i) => ({
    prompt: p.prompt, engine: p.engine, appearsDcycle: p.appearsDcycle[i], citedUrl: p.citedUrl[i],
    competitorsCited: p.competitorsCited[i], country: p.country, month,
  })),
);

// Bing WMT — salud técnica de indexación (proxy de visibilidad en Copilot,
// que se nutre del índice de Bing).
export type BingSummary = { country: string; month: string; impressions: number; clicks: number; position: number };
const bingBase: { country: string; impressions: [number, number, number]; clicks: [number, number, number]; position: [number, number, number] }[] = [
  { country: "ES", impressions: [38000, 41200, 44100], clicks: [1800, 2100, 2450], position: [9.8, 8.9, 8.1] },
  { country: "UK", impressions: [21000, 22800, 24500], clicks: [980, 1120, 1300], position: [11.2, 10.4, 9.6] },
  { country: "DE", impressions: [9800, 10500, 11200], clicks: [410, 460, 510], position: [13.5, 12.8, 12.1] },
];
export const mockBingSummary: BingSummary[] = bingBase.flatMap((b) =>
  MONTHS.map((month, i) => ({ country: b.country, month, impressions: b.impressions[i], clicks: b.clicks[i], position: b.position[i] })),
);

// Solicitantes de demo orgánica (SEO + AI_REFERRALS) — base del lead status.
export const mockOrganicDemoLeads: OrganicDemoLead[] = [
  { email: "irene@greenbuild.es", company: "GreenBuild", source: "ORGANIC_SEARCH", entryKeyword: "software gestión huella de carbono", landingPage: "/producto", requestDate: "2026-06-10", leadStatus: "SQL", isMql: true, dealAmount: 32000, dealStage: "Propuesta enviada", ownerSdr: "Juanjo", country: "ES", month: "2026-06" },
  { email: "tom@northgrid.co.uk", company: "NorthGrid", source: "ORGANIC_SEARCH", entryKeyword: "software reporting csrd", landingPage: "/producto/csrd", requestDate: "2026-06-08", leadStatus: "MQL", isMql: true, dealAmount: 0, dealStage: "—", ownerSdr: "Paula", country: "UK", month: "2026-06" },
  { email: "petra@solarmax.de", company: "SolarMax", source: "AI_REFERRALS", entryKeyword: "software doble materialidad CSRD (Copilot)", landingPage: "/producto/doble-materialidad", requestDate: "2026-06-05", leadStatus: "NEW", isMql: false, dealAmount: 0, dealStage: "—", ownerSdr: "Juanjo", country: "DE", month: "2026-06" },
  { email: "marc@fintrail.es", company: "FinTrail", source: "AI_REFERRALS", entryKeyword: "mejor software de huella de carbono (Copilot)", landingPage: "/producto", requestDate: "2026-05-22", leadStatus: "PIPELINE", isMql: true, dealAmount: 48000, dealStage: "Negociación", ownerSdr: "Paula", country: "ES", month: "2026-05" },
  { email: "helen@bridgeworks.co.uk", company: "Bridgeworks", source: "ORGANIC_SEARCH", entryKeyword: "software doble materialidad", landingPage: "/blog/doble-materialidad-guia", requestDate: "2026-05-15", leadStatus: "CLOSED_WON", isMql: true, dealAmount: 61000, dealStage: "Closed Won", ownerSdr: "Juanjo", country: "UK", month: "2026-05" },
  { email: "nora@ecoparts.es", company: "EcoParts", source: "ORGANIC_SEARCH", entryKeyword: "calculadora de huella de carbono", landingPage: "/blog/que-es-huella-de-carbono", requestDate: "2026-04-18", leadStatus: "NEW", isMql: false, dealAmount: 0, dealStage: "—", ownerSdr: "Paula", country: "ES", month: "2026-04" },
];

// Objetivo de demos orgánicas (target vs real) — solo el target es editable.
export type OrganicDemoTarget = { month: string; country: string; targetDemos: number };
export const mockOrganicDemoTargets: OrganicDemoTarget[] = [
  { month: "2026-06", country: "ES", targetDemos: 10 },
  { month: "2026-06", country: "UK", targetDemos: 6 },
  { month: "2026-06", country: "DE", targetDemos: 3 },
];
export const ORGANIC_TARGET_KEY = "gtm.organicDemoTargets.v1";
