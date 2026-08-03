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
import { fetchAll } from "@/lib/supabase/fetch-all";

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

// Cola para Data Health: contactos cuyo utm_campaign no casó ninguna
// campaña por ninguno de los pasos automáticos (exacto/alias/tag manual —
// mismo universo que `campaign_match_keys`, migración 0008). Fuzzy queda
// fuera adrede: es la vía de resolución humana, no de detección.
//
// Nota: `utm_campaign_norm` en `contacts` se rellena SIEMPRE que hay
// `utm_campaign_raw` (ver mapContact en lib/hubspot.ts) — no indica match,
// solo que se normalizó. El único chequeo correcto es un anti-join real
// contra el universo de claves resueltas.
export async function listUnmatchedUtms(): Promise<string[]> {
  const sb = getSupabase();
  if (!sb) return [];

  const [campaignsRes, aliasesRes, tagsRes] = await Promise.all([
    sb.from("campaigns").select("campaign_name_norm"),
    sb.from("campaign_aliases").select("norm_key"),
    sb.from("utm_manual_tags").select("utm_norm"),
  ]);
  const resolved = new Set<string>([
    ...((campaignsRes.data ?? []) as { campaign_name_norm: string }[]).map((r) => r.campaign_name_norm),
    ...((aliasesRes.data ?? []) as { norm_key: string }[]).map((r) => r.norm_key),
    ...((tagsRes.data ?? []) as { utm_norm: string }[]).map((r) => r.utm_norm),
  ]);

  const contacts = await fetchAll<{ utm_campaign_raw: string | null; utm_campaign_norm: string | null }>(
    () =>
      sb
        .from("contacts")
        .select("utm_campaign_raw, utm_campaign_norm")
        .not("utm_campaign_raw", "is", null),
  );

  const unmatchedByNorm = new Map<string, string>();
  for (const c of contacts) {
    if (!c.utm_campaign_norm || !c.utm_campaign_raw) continue;
    if (resolved.has(c.utm_campaign_norm)) continue;
    if (!unmatchedByNorm.has(c.utm_campaign_norm)) {
      unmatchedByNorm.set(c.utm_campaign_norm, c.utm_campaign_raw);
    }
  }
  return [...unmatchedByNorm.values()];
}
