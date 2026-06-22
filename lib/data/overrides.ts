// country_overrides — excepciones de país por patrón (PRD §8.2).
// Editable desde Explorer + Admin. Cuando Supabase no esté vivo, fallback a
// mock vacío (la app sigue funcionando, los overrides solo viven en memoria).

import { getSupabase } from "@/lib/supabase/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CountryOverrides } from "@/lib/mock-data";

export async function listCountryOverrides(): Promise<CountryOverrides> {
  const sb = getSupabase();
  if (!sb) return {};
  const { data, error } = await sb.from("country_overrides").select("pattern, country");
  if (error || !data) return {};
  return Object.fromEntries(data.map((r) => [r.pattern, r.country]));
}

export async function upsertCountryOverride(pattern: string, country: string): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  await sb.from("country_overrides").upsert(
    { pattern, country, author: "anonymous@dev" },
    { onConflict: "pattern" },
  );
}

export async function deleteCountryOverride(pattern: string): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  await sb.from("country_overrides").delete().eq("pattern", pattern);
}
