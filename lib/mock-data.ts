// Dataset de ejemplo + tipos + helpers de filtrado/agrupación.
// Incluye dimensión de MES para poder filtrar por país y mes en cada pantalla.
// En producción esto se sustituye por queries a Supabase.

import type { ChannelMetrics } from "./kpis";
import type { HeatContact } from "./heat";
import { regionOf, type CountryGroups } from "./regions";
import type { DbOrganicTraffic, DbAiVisibility } from "./supabase/types";

export const IS_MOCK = true;

// Canales de la plataforma (migración 0022). Paid: LinkedIn, Google.
// No-paid inbound: Organic (organic search + direct traffic), Email
// Marketing, y "Otros" residual (other campaigns, AI referrals, social
// orgánico, referrals, sin etiqueta). OFFLINE NO es un canal: se excluye
// en la vista (la plataforma solo trackea inbound).
export type Channel = "LinkedIn" | "Google" | "Organic" | "Email Marketing" | "Otros";

// Canales de pago (los únicos con spend). Sirve para separar paid vs
// no-paid en Overview y en los helpers de país.
export const PAID_CHANNELS: Channel[] = ["LinkedIn", "Google"];
export const isPaidChannel = (c: string): boolean => c === "LinkedIn" || c === "Google";

export type CampaignRow = ChannelMetrics & {
  channel: Channel;
  campaign: string;
  campaignGroup: string | null; // país se deriva del GRUPO en LinkedIn (§7.3)
  country: string;
  month: string; // YYYY-MM
};

// Meses base — usados solo cuando no hay datos reales aún. La UI prefiere
// derivar los meses del dataset real (ver `monthsOf` en lib/mock-data).
export const MONTHS = ["2026-04", "2026-05", "2026-06"] as const;
export const CHANNELS: Channel[] = ["LinkedIn", "Google", "Organic", "Email Marketing", "Otros"];
export const NO_COUNTRY = "Sin país / Multi";

/** Lista ordenada de meses presentes en un dataset (YYYY-MM ascendente). */
export const monthsOf = (rows: CampaignRow[]): string[] =>
  [...new Set(rows.map((r) => r.month))].sort();

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

// ── Filtros (región / país / mes / canal) ─────────────────────
// `region` se resuelve contra el mapa país→grupo (lib/regions.ts) cuando el
// filtro recibe `groups`; sin mapa se ignora, así las pantallas que aún no
// pasan regiones siguen funcionando igual.
// `month` es un filtro puntual (un mes exacto); `monthFrom`/`monthTo` acotan
// un RANGO [desde, hasta] inclusivo — sirve para quitar años que no
// interesan y para fijar la ventana de comparación. Se pueden combinar.
export type Filters = {
  country: string; month: string; channel: string; region: string;
  monthFrom: string; monthTo: string;
};
export const emptyFilters: Filters = {
  country: "", month: "", channel: "", region: "", monthFrom: "", monthTo: "",
};

// Primer mes del año en curso (YYYY-01). Default útil para arrancar las
// pantallas de comparación sin la cola de años viejos con 1-2 leads.
export function currentYearStart(): string {
  return `${new Date().getFullYear()}-01`;
}

// ¿Cae `month` (YYYY-MM) dentro del rango del filtro? Comparación lexicográfica
// (los YYYY-MM ordenan como el tiempo). Exportado para las pantallas que
// filtran a mano (deals, forecast) y no pasan por `filterCampaigns`.
export function inMonthRange(month: string, f: Pick<Filters, "monthFrom" | "monthTo">): boolean {
  return (!f.monthFrom || month >= f.monthFrom) && (!f.monthTo || month <= f.monthTo);
}

export function filterCampaigns(
  rows: CampaignRow[],
  f: Filters,
  groups?: CountryGroups,
): CampaignRow[] {
  return rows.filter(
    (r) =>
      (!f.region || !groups || regionOf(r.country, groups) === f.region) &&
      (!f.country || r.country === f.country) &&
      (!f.month || r.month === f.month) &&
      inMonthRange(r.month, f) &&
      (!f.channel || r.channel === f.channel),
  );
}

export const countriesOf = (rows: CampaignRow[]) => [...new Set(rows.map((r) => r.country))].sort();

// Solo países con actividad paid (campaña o atribución LinkedIn/Google): el
// dropdown de país no debe listar todos los orígenes de leads orgánicos del
// mundo — a esos se llega por región.
export const paidCountriesOf = (rows: CampaignRow[]) =>
  [...new Set(rows.filter((r) => isPaidChannel(r.channel)).map((r) => r.country))].sort();

// ── Overrides de país (PRD §8.2) ──────────────────────────────
// Mapa { campaña (o patrón) → país }. Se aplica encima de los datos vengan
// de mock o de Supabase. Persistencia real en `country_overrides` (Postgres).
export type CountryOverrides = Record<string, string>;
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

// ── Matriz de comparación (dimensión × mes) ────────────────────
// Una sola métrica en cada celda, meses como columnas y una dimensión
// (país / canal / campaña) como filas, con totales de fila y columna. Es
// lo que hace falta para comparar de un vistazo (p. ej. Pipeline € por país
// y mes) — el pivot anidado no sirve para eso.
export type MetricKey = "spend" | "leads" | "mql" | "sql" | "pipeline" | "closedWon";
export const METRIC_LABELS: Record<MetricKey, string> = {
  spend: "Spend", leads: "Leads", mql: "MQL", sql: "SQL",
  pipeline: "Pipeline €", closedWon: "Closed Won",
};
export const METRIC_IS_EUR: Record<MetricKey, boolean> = {
  spend: true, leads: false, mql: false, sql: false, pipeline: true, closedWon: true,
};

export type MonthMatrix = {
  months: string[];
  rows: { key: string; cells: number[]; total: number }[];
  colTotals: number[];
  grandTotal: number;
};

export function buildMonthMatrix(
  rows: CampaignRow[],
  rowDim: Dimension,
  metric: MetricKey,
): MonthMatrix {
  const months = [...new Set(rows.map((r) => r.month))].sort();
  const monthIdx = new Map(months.map((m, i) => [m, i]));
  const byKey = new Map<string, number[]>();
  for (const r of rows) {
    const key = String(r[rowDim]);
    let arr = byKey.get(key);
    if (!arr) { arr = new Array(months.length).fill(0); byKey.set(key, arr); }
    arr[monthIdx.get(r.month)!] += Number(r[metric] ?? 0);
  }
  const built = [...byKey.entries()]
    .map(([key, cells]) => ({ key, cells, total: cells.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total);
  const colTotals = months.map((_, i) => built.reduce((a, r) => a + r.cells[i], 0));
  const grandTotal = colTotals.reduce((a, b) => a + b, 0);
  return { months, rows: built, colTotals, grandTotal };
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

// ── SEO orgánico + AEO (PRD §11) ────────────────────────────────
// Mock usado SOLO como fallback cuando Supabase aún no tiene filas en
// `organic_traffic`/`ai_visibility`/`domain_authority` (fuentes "on hold" en
// DECISIONES.md #6/#7). Motor AEO prioritario: Microsoft Copilot — la
// mayoría de clientes Dcycle lo usan, y Copilot se nutre del índice de Bing.
export const mockDomainAuthority = { da: 47, provider: "Moz" };

const seoPageBase: {
  page: string; country: string;
  position: [number, number, number]; clicks: [number, number, number]; impressions: [number, number, number];
}[] = [
  { page: "/producto", country: "ES", position: [3.8, 3.1, 2.4], clicks: [420, 510, 610], impressions: [9800, 10400, 11200] },
  { page: "/producto/csrd", country: "UK", position: [4.5, 3.9, 3.2], clicks: [210, 260, 300], impressions: [6100, 6600, 7000] },
  { page: "/pricing", country: "ES", position: [6.2, 5.4, 4.6], clicks: [150, 180, 210], impressions: [4200, 4500, 4900] },
  { page: "/blog/que-es-huella-de-carbono", country: "ES", position: [3.9, 4.0, 4.1], clicks: [890, 910, 930], impressions: [21000, 21500, 22000] },
  { page: "/blog/doble-materialidad-guia", country: "UK", position: [7.1, 6.9, 6.8], clicks: [240, 250, 260], impressions: [7200, 7300, 7500] },
];
export const mockOrganicTraffic: DbOrganicTraffic[] = seoPageBase.flatMap((p, pi) =>
  MONTHS.map((month, i) => ({
    id: `mock-traffic-${pi}-${i}`,
    source: "GSC" as const,
    date: `${month}-15`,
    query: null,
    page: p.page,
    country: p.country,
    impressions: p.impressions[i],
    clicks: p.clicks[i],
    position_avg: p.position[i],
    is_branded: false,
    synced_at: `${month}-15T00:00:00Z`,
  })),
);

// Bing — salud técnica de indexación (proxy de visibilidad en Copilot, que
// se nutre del índice de Bing). Mismo `organic_traffic`, `source = 'Bing'`.
const bingBase: { country: string; impressions: [number, number, number]; clicks: [number, number, number]; position: [number, number, number] }[] = [
  { country: "ES", impressions: [38000, 41200, 44100], clicks: [1800, 2100, 2450], position: [9.8, 8.9, 8.1] },
  { country: "UK", impressions: [21000, 22800, 24500], clicks: [980, 1120, 1300], position: [11.2, 10.4, 9.6] },
];
export const mockBingTraffic: DbOrganicTraffic[] = bingBase.flatMap((b, bi) =>
  MONTHS.map((month, i) => ({
    id: `mock-bing-${bi}-${i}`,
    source: "Bing" as const,
    date: `${month}-15`,
    query: null,
    page: null,
    country: b.country,
    impressions: b.impressions[i],
    clicks: b.clicks[i],
    position_avg: b.position[i],
    is_branded: false,
    synced_at: `${month}-15T00:00:00Z`,
  })),
);

// Banco de prompts estratégicos → cita, por motor. Copilot con más cobertura
// (motor prioritario) y mejorando mes a mes en la narrativa del mock.
const aiPromptBase: {
  prompt: string; platform: string;
  appeared: [boolean, boolean, boolean];
  citedUrl: [string | null, string | null, string | null];
  competitors: [string[], string[], string[]];
}[] = [
  { prompt: "mejor software de huella de carbono para empresas", platform: "Copilot",
    appeared: [false, true, true], citedUrl: [null, "dcycle.io/producto", "dcycle.io/producto"],
    competitors: [["Persefoni", "Watershed"], ["Persefoni"], ["Persefoni"]] },
  { prompt: "software reporting CSRD recomendado", platform: "Copilot",
    appeared: [false, false, true], citedUrl: [null, null, "dcycle.io/producto/csrd"],
    competitors: [["Sphera", "Watershed"], ["Sphera", "Watershed"], ["Sphera"]] },
  { prompt: "herramientas para calcular alcance 3 (scope 3)", platform: "Copilot",
    appeared: [true, true, true], citedUrl: ["dcycle.io/blog/alcance-3-que-es", "dcycle.io/blog/alcance-3-que-es", "dcycle.io/producto"],
    competitors: [["Watershed"], [], []] },
  { prompt: "software doble materialidad CSRD", platform: "Copilot",
    appeared: [false, false, false], citedUrl: [null, null, null],
    competitors: [["Sphera", "Persefoni"], ["Sphera", "Persefoni"], ["Sphera"]] },
  { prompt: "best carbon accounting software for enterprise", platform: "ChatGPT",
    appeared: [false, true, true], citedUrl: [null, "dcycle.io/producto", "dcycle.io/producto"],
    competitors: [["Watershed", "Persefoni"], ["Watershed"], ["Watershed"]] },
  { prompt: "CSRD reporting software comparison", platform: "ChatGPT",
    appeared: [false, false, false], citedUrl: [null, null, null],
    competitors: [["Sphera", "Workiva"], ["Sphera", "Workiva"], ["Workiva"]] },
  { prompt: "mejor software huella de carbono", platform: "Perplexity",
    appeared: [true, true, true], citedUrl: ["dcycle.io/producto", "dcycle.io/producto", "dcycle.io/producto"],
    competitors: [["Persefoni"], ["Persefoni"], []] },
  { prompt: "carbon footprint software for SMEs", platform: "Gemini",
    appeared: [false, false, false], citedUrl: [null, null, null],
    competitors: [["Watershed", "Persefoni"], ["Watershed"], ["Watershed"]] },
];
export const mockAiVisibility: DbAiVisibility[] = aiPromptBase.flatMap((p, pi) =>
  MONTHS.map((month, i) => ({
    id: `mock-ai-${pi}-${i}`,
    date: `${month}-15`,
    prompt: p.prompt,
    appeared: p.appeared[i],
    rank_in_answer: p.appeared[i] ? 1 : null,
    competitors: p.competitors[i].map((name) => ({ name, appeared: true, rank: null })),
    cited_url: p.citedUrl[i],
    platform: p.platform,
    synced_at: `${month}-15T00:00:00Z`,
  })),
);

// Rank tracker (Top 3) — separado de `organic_traffic` (que es tráfico GSC/
// GA4/Bing por query, no ranking de rank tracker dedicado).
const keywordRankBase: { keyword: string; position: [number, number, number] }[] = [
  { keyword: "software gestión huella de carbono", position: [4.1, 3.2, 2.4] },
  { keyword: "software reporting csrd", position: [4.0, 3.6, 3.2] },
  { keyword: "calculadora de huella de carbono", position: [5.0, 4.6, 4.1] },
];
export const mockKeywordRankings: { keyword: string; position: number; date: string }[] = keywordRankBase.flatMap((k) =>
  MONTHS.map((month, i) => ({ keyword: k.keyword, position: k.position[i], date: `${month}-15` })),
);

// Leads/pipeline orgánicos + IA (analytics_source = ORGANIC_SEARCH / AI_REFERRALS).
export const mockOrganicLeads: {
  contactId: string; source: "ORGANIC_SEARCH" | "AI_REFERRALS"; month: string; isMql: boolean; dealAmount: number;
}[] = [
  { contactId: "mock-lead-1", source: "ORGANIC_SEARCH", month: "2026-06", isMql: true, dealAmount: 32000 },
  { contactId: "mock-lead-2", source: "ORGANIC_SEARCH", month: "2026-06", isMql: true, dealAmount: 0 },
  { contactId: "mock-lead-3", source: "AI_REFERRALS", month: "2026-06", isMql: false, dealAmount: 0 },
  { contactId: "mock-lead-4", source: "AI_REFERRALS", month: "2026-05", isMql: true, dealAmount: 48000 },
  { contactId: "mock-lead-5", source: "ORGANIC_SEARCH", month: "2026-05", isMql: true, dealAmount: 61000 },
  { contactId: "mock-lead-6", source: "ORGANIC_SEARCH", month: "2026-04", isMql: false, dealAmount: 0 },
];
