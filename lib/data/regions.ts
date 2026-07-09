// Acceso a datos de regiones — mapa país→grupo editable en `country_groups`
// (migración 0015). Server-side only (importa el cliente admin); los
// helpers puros están en lib/regions.ts.

import { getSupabase } from "@/lib/supabase/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { DEFAULT_GROUPS, type CountryGroups } from "@/lib/regions";

export async function listCountryGroups(): Promise<CountryGroups> {
  const sb = getSupabase();
  if (!sb) return DEFAULT_GROUPS;
  const { data } = await sb.from("country_groups").select("country, group_name");
  if (!data || data.length === 0) return DEFAULT_GROUPS;
  return Object.fromEntries(
    (data as { country: string; group_name: string }[]).map((r) => [r.country, r.group_name]),
  );
}

export async function upsertCountryGroup(country: string, groupName: string): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  await sb
    .from("country_groups")
    .upsert(
      { country: country.trim(), group_name: groupName.trim(), updated_at: new Date().toISOString() },
      { onConflict: "country" },
    );
}
