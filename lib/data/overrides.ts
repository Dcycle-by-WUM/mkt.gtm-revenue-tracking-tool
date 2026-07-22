// country_overrides — excepciones de país por patrón (PRD §8.2).
// Editable desde Explorer + Admin. Cuando Supabase no esté vivo, fallback a
// mock vacío (la app sigue funcionando, los overrides solo viven en memoria).

import { getSupabase } from "@/lib/supabase/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeCountryLabel, parseCampaignCountry } from "@/lib/campaign-country";
import type { CountryOverrides } from "@/lib/mock-data";

export async function listCountryOverrides(): Promise<CountryOverrides> {
  const sb = getSupabase();
  if (!sb) return {};
  const { data, error } = await sb.from("country_overrides").select("pattern, country");
  if (error || !data) return {};
  // País normalizado al vocabulario del parser ("ES" → "Spain") para que un
  // override legacy no parta un país en dos buckets distintos en pantalla.
  return Object.fromEntries(data.map((r) => [r.pattern, normalizeCountryLabel(r.country)]));
}

// Re-hornea `campaigns.country_parsed` (coincidencia EXACTA por nombre,
// mismo criterio que `countryFor` en lib/data/ad-spend.ts) y refresca las
// vistas. Sin esto, un override guardado desde Explorer solo se ve ahí
// mismo (aplica overrides en caliente, client-side) — Overview, Paid,
// Campaign Detail y Forecast leen `campaigns`/`kpi_by_campaign_month`
// directos y seguirían mostrando el país viejo hasta la próxima subida de
// CSV, que es la única otra vía que re-deriva country_parsed.
async function reapplyCampaignCountry(pattern: string, country: string): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const { error } = await sb
    .from("campaigns")
    .update({ country_parsed: country })
    .eq("campaign_name", pattern);
  if (error) {
    console.error(`[country-override] update campaigns.country_parsed failed: ${error.message}`);
    return;
  }
  const { error: rpcError } = await sb.rpc("refresh_kpi_views");
  if (rpcError) console.error(`[country-override] refresh_kpi_views failed: ${rpcError.message}`);
}

export async function upsertCountryOverride(pattern: string, country: string): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  await sb.from("country_overrides").upsert(
    { pattern, country, author: "anonymous@dev" },
    { onConflict: "pattern" },
  );
  await reapplyCampaignCountry(pattern, normalizeCountryLabel(country));
}

export async function deleteCountryOverride(pattern: string): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  await sb.from("country_overrides").delete().eq("pattern", pattern);
  // Sin el override, el país "correcto" es el que el parser derivaría del
  // nombre desde cero — no queda registrado en ningún sitio más.
  await reapplyCampaignCountry(pattern, parseCampaignCountry(pattern));
}
