// SEO orgánico + AEO — Brief §10, docs/SEO-ORGANICO.md.
// Conectores nativos por canal (GSC/GA4/Bing/HubSpot) — no Supermetrics para SEO/AEO.

// ── SEO: keywords y páginas ──────────────────────────────────────
export type Intent = "transactional" | "informational" | "branded";

// Keyword estratégica con su página objetivo y su ranking real (GSC).
export type SeoKeyword = {
  keyword: string;
  intent: Intent;
  targetUrl: string; // página transaccional QUE DEBERÍA rankear (demo/pricing/producto)
  rankingUrl: string; // página que GSC dice que rankea de verdad
  position: number; // posición media (GSC)
  clicks: number;
  impressions: number;
  organicDemos: number; // demos atribuidas a esta keyword (GA4 + HubSpot)
  isBranded: boolean;
  isStrategic: boolean;
  country: string;
  month: string;
};

// URL/landing con su rendimiento orgánico (GSC page + GA4).
export type SeoPage = {
  url: string;
  isTransactional: boolean;
  position: number;
  clicks: number;
  impressions: number;
  organicSessions: number;
  organicDemos: number;
  country: string;
  month: string;
};

// ── AEO: motores de IA y banco de prompts ────────────────────────
// Copilot es el motor prioritario: la mayoría de clientes Dcycle lo usan y
// Copilot se nutre del índice de Bing (a diferencia de ChatGPT/Perplexity,
// que rastrean con sus propios bots).
export type AiEngine = "copilot" | "chatgpt" | "perplexity" | "gemini";

export const AI_ENGINES: AiEngine[] = ["copilot", "chatgpt", "perplexity", "gemini"];

export const AI_ENGINE_LABELS: Record<AiEngine, string> = {
  copilot: "Copilot",
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  gemini: "Gemini",
};

// Un prompt estratégico y su resultado por motor — banco de prompts → cita.
export type AiVisibilityPrompt = {
  prompt: string;
  engine: AiEngine;
  appearsDcycle: boolean;
  citedUrl: string | null; // URL que citó el motor (o null si no aparece ninguna)
  competitorsCited: string[];
  country: string;
  month: string;
};

// ── Demos orgánicas / lead status ─────────────────────────────────
export const LEAD_STATUSES = ["NEW", "MQL", "SQL", "PIPELINE", "CLOSED_WON"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

// Solicitante de demo orgánica — base del tracking de lead status.
export type OrganicDemoLead = {
  email: string;
  company: string;
  source: "ORGANIC_SEARCH" | "AI_REFERRALS";
  entryKeyword: string;
  landingPage: string;
  requestDate: string; // ISO
  leadStatus: string; // NEW | MQL | SQL | PIPELINE | CLOSED_WON
  isMql: boolean;
  dealAmount: number;
  dealStage: string; // pipeline €
  ownerSdr: string;
  country: string;
  month: string;
};

// ── Filtros (país / mes) ──────────────────────────────────────────
export type SeoFilters = { country: string; month: string };

export function filterSeo<T extends { country: string; month: string }>(
  rows: T[],
  f: SeoFilters,
): T[] {
  return rows.filter(
    (r) => (!f.country || r.country === f.country) && (!f.month || r.month === f.month),
  );
}

// ── Filtro de fechas (rango desde/hasta, comparación de periodos) ─
export type SeoRangeFilters = { country: string; from: string; to: string };

export function filterSeoRange<T extends { country: string; month: string }>(
  rows: T[],
  f: SeoRangeFilters,
): T[] {
  return rows.filter(
    (r) =>
      (!f.country || r.country === f.country) &&
      (!f.from || r.month >= f.from) &&
      (!f.to || r.month <= f.to),
  );
}

// ── Helpers SEO ────────────────────────────────────────────────────
export function topUrls(pages: SeoPage[]): SeoPage[] {
  return [...pages].sort((a, b) => a.position - b.position);
}

// gap: la página transaccional objetivo no es la que rankea de verdad.
export function keywordGap(kw: SeoKeyword): boolean {
  return kw.rankingUrl !== kw.targetUrl;
}

export function countOrganicDemos(leads: OrganicDemoLead[], f: SeoFilters): number {
  return filterSeo(leads, f).length;
}

export function funnelByStatus(leads: OrganicDemoLead[]): { status: string; count: number }[] {
  return LEAD_STATUSES.map((status) => ({
    status,
    count: leads.filter((l) => l.leadStatus === status).length,
  }));
}

export function pipelineFromDemos(leads: OrganicDemoLead[]): number {
  return leads.reduce((sum, l) => sum + l.dealAmount, 0);
}

// ── Helpers AEO ─────────────────────────────────────────────────────
// % de prompts donde aparece Dcycle, por motor (Copilot primero).
export function aiVisibilityByEngine(
  prompts: AiVisibilityPrompt[],
): { engine: AiEngine; visibility: number | null; total: number }[] {
  return AI_ENGINES.map((engine) => {
    const rows = prompts.filter((p) => p.engine === engine);
    const visibility =
      rows.length === 0 ? null : rows.filter((p) => p.appearsDcycle).length / rows.length;
    return { engine, visibility, total: rows.length };
  });
}

// Cuota de aparición de Dcycle vs competidores citados, para un motor dado.
export function aiShareOfVoice(prompts: AiVisibilityPrompt[], engine: AiEngine): number | null {
  const rows = prompts.filter((p) => p.engine === engine);
  if (rows.length === 0) return null;
  const dcycleMentions = rows.filter((p) => p.appearsDcycle).length;
  const competitorMentions = rows.reduce((s, p) => s + p.competitorsCited.length, 0);
  const total = dcycleMentions + competitorMentions;
  return total === 0 ? null : dcycleMentions / total;
}

// Prompts donde Dcycle NO aparece — el "gap" de AEO (análogo a keywordGap en SEO).
export function aiCitationGaps(prompts: AiVisibilityPrompt[]): AiVisibilityPrompt[] {
  return prompts.filter((p) => !p.appearsDcycle);
}
