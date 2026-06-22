// Fórmulas de negocio — Brief §7.6.
// Todas las divisiones protegidas contra 0 → devuelven null cuando no aplican.

export type ChannelMetrics = {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  mql: number;
  sql: number;
  pipeline: number; // € en pipeline
  closedWon: number; // € ganado
};

const ratio = (num: number, den: number): number | null =>
  den === 0 ? null : num / den;

/** CTR = Clics / Impresiones */
export const ctr = (m: ChannelMetrics) => ratio(m.clicks, m.impressions);

/** CPC = Spend / Clics */
export const cpc = (m: ChannelMetrics) => ratio(m.spend, m.clicks);

/** CPM = (Spend / Impresiones) × 1000 */
export const cpm = (m: ChannelMetrics) => {
  const r = ratio(m.spend, m.impressions);
  return r === null ? null : r * 1000;
};

/** CPL = Spend / Leads */
export const cpl = (m: ChannelMetrics) => ratio(m.spend, m.leads);

/** CPMQL = Spend / MQL */
export const cpmql = (m: ChannelMetrics) => ratio(m.spend, m.mql);

/** CPSQL = Spend / SQL */
export const cpsql = (m: ChannelMetrics) => ratio(m.spend, m.sql);

/** ROI = (Pipeline € − Spend) / Spend */
export const roi = (m: ChannelMetrics) => ratio(m.pipeline - m.spend, m.spend);

/** % MQL/Lead */
export const mqlRate = (m: ChannelMetrics) => ratio(m.mql, m.leads);

/** % SQL/MQL */
export const sqlRate = (m: ChannelMetrics) => ratio(m.sql, m.mql);

// ── Formateadores para UI ──────────────────────────────────────

export const fmtEur = (v: number | null) =>
  v === null
    ? "—"
    : new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(v);

export const fmtPct = (v: number | null) =>
  v === null
    ? "—"
    : new Intl.NumberFormat("es-ES", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(v);

export const fmtNum = (v: number | null) =>
  v === null ? "—" : new Intl.NumberFormat("es-ES").format(v);
