// Motor de normalización + matching UTM ↔ campaña — PRD §8.1.
//
//  1) Normalización: lower → trim → quitar acentos → colapsar espacios →
//     normalizar separadores → clave canónica (segmento antes del primer "|"/"[").
//  2) Matching, en cascada:
//     a) exacto sobre clave canónica
//     b) alias (campaign_aliases)
//     c) tag manual (utm_manual_tags)
//     d) fuzzy (trigram/Levenshtein) con confirmación humana
//     e) sin match → cola Data Health
//
// Las cuatro primeras devuelven `{ status, campaignId? }`; "e" devuelve
// `{ status: "unmatched" }`. La pantalla Data Health renderiza la cola.

import { getSupabase } from "@/lib/supabase/client";

const ACCENT_MAP: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n",
  Á: "a", É: "e", Í: "i", Ó: "o", Ú: "u", Ü: "u", Ñ: "n",
};

export function normalizeUtm(raw: string): string {
  if (!raw) return "";
  let s = raw.trim().toLowerCase();
  // 1) quitar acentos
  s = s.replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, (c) => ACCENT_MAP[c] ?? c);
  // 2) separadores → guion bajo
  s = s.replace(/[|\-]+/g, "_");
  // 3) colapsar espacios
  s = s.replace(/\s+/g, " ").trim();
  // 4) clave canónica: lo que va ANTES del primer '|' o '[' (en el raw)
  const stop = Math.min(
    ...[raw.indexOf("|"), raw.indexOf("[")].filter((i) => i >= 0),
  );
  if (Number.isFinite(stop) && stop > 0) {
    s = raw
      .slice(0, stop)
      .trim()
      .toLowerCase()
      .replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, (c) => ACCENT_MAP[c] ?? c)
      .replace(/[|\-]+/g, "_")
      .replace(/\s+/g, " ")
      .trim();
  }
  return s;
}

export type MatchResult =
  | { status: "exact"; campaignId: string }
  | { status: "alias"; campaignId: string }
  | { status: "manual"; campaignId: string }
  | { status: "fuzzy"; campaignId: string; score: number }
  | { status: "unmatched" };

// Distancia de Levenshtein normalizada (0 = idéntico, 1 = diferente).
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (!a || !b) return 0;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  const dist = dp[m][n];
  return 1 - dist / Math.max(m, n);
}

const FUZZY_THRESHOLD = 0.85;

export async function matchUtmToCampaign(utmRaw: string): Promise<MatchResult> {
  const sb = getSupabase();
  if (!sb || !utmRaw) return { status: "unmatched" };
  const norm = normalizeUtm(utmRaw);

  // a) exacto sobre clave canónica
  {
    const { data } = await sb
      .from("campaigns")
      .select("id")
      .eq("campaign_name_norm", norm)
      .maybeSingle();
    if (data) return { status: "exact", campaignId: data.id };
  }

  // b) alias
  {
    const { data } = await sb
      .from("campaign_aliases")
      .select("campaign_id")
      .eq("norm_key", norm)
      .maybeSingle();
    if (data) return { status: "alias", campaignId: data.campaign_id };
  }

  // c) tag manual
  {
    const { data } = await sb
      .from("utm_manual_tags")
      .select("campaign_id")
      .eq("utm_norm", norm)
      .maybeSingle();
    if (data) return { status: "manual", campaignId: data.campaign_id };
  }

  // d) fuzzy
  {
    const { data: candidates } = await sb
      .from("campaigns")
      .select("id, campaign_name_norm");
    if (candidates && candidates.length > 0) {
      let best: { id: string; score: number } | null = null;
      for (const c of candidates as { id: string; campaign_name_norm: string }[]) {
        const s = similarity(norm, c.campaign_name_norm);
        if (!best || s > best.score) best = { id: c.id, score: s };
      }
      if (best && best.score >= FUZZY_THRESHOLD) {
        return { status: "fuzzy", campaignId: best.id, score: best.score };
      }
    }
  }

  return { status: "unmatched" };
}

// Cola para Data Health: contactos cuyo utm_campaign no casó nada.
export async function listUnmatchedUtms(): Promise<string[]> {
  const sb = getSupabase();
  if (!sb) return [];
  // Heurística: contactos con utm_campaign_raw no nulo pero sin utm_campaign_norm
  // resuelto a ninguna campaña. La ingesta CRM marca esto.
  const { data } = await sb
    .from("contacts")
    .select("utm_campaign_raw")
    .not("utm_campaign_raw", "is", null)
    .is("utm_campaign_norm", null);
  if (!data) return [];
  return [...new Set((data as { utm_campaign_raw: string }[]).map((r) => r.utm_campaign_raw))];
}
