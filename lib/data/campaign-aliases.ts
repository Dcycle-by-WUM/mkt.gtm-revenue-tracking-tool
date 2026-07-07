// campaign_aliases — overrides manuales UTM ↔ campaña (PRD §7.2 / §8.1).
// Mismo patrón que lib/data/overrides.ts (country_overrides), pero esta
// tabla resuelve el join de atribución (kpi_by_campaign_month vía
// campaign_match_keys — migración 0008), no solo el país.

import { getSupabase } from "@/lib/supabase/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizeUtm } from "@/lib/matching";

export type CampaignAlias = {
  normKey: string;
  campaignId: string;
};

export async function listCampaignAliases(): Promise<CampaignAlias[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from("campaign_aliases").select("norm_key, campaign_id");
  if (error || !data) return [];
  return data.map((r) => ({ normKey: r.norm_key, campaignId: r.campaign_id }));
}

// `rawUtm` es el valor tal cual viene de HubSpot (utm_campaign); se
// normaliza aquí para que quede consistente con `campaign_name_norm`.
export async function upsertCampaignAlias(rawUtm: string, campaignId: string): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const normKey = normalizeUtm(rawUtm);
  if (!normKey) return;

  await sb.from("campaign_aliases").upsert(
    { norm_key: normKey, campaign_id: campaignId, author: "anonymous@dev" },
    { onConflict: "norm_key" },
  );

  // El alias solo afecta a los KPIs tras refrescar la vista materializada
  // (campaign_match_keys es una vista normal, pero kpi_by_campaign_month no).
  try {
    await sb.rpc("refresh_kpi_views");
  } catch (e) {
    console.error(`[campaign-aliases] refresh_kpi_views failed: ${e instanceof Error ? e.message : e}`);
  }
}

export async function deleteCampaignAlias(normKey: string): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  await sb.from("campaign_aliases").delete().eq("norm_key", normKey);
  try {
    await sb.rpc("refresh_kpi_views");
  } catch (e) {
    console.error(`[campaign-aliases] refresh_kpi_views failed: ${e instanceof Error ? e.message : e}`);
  }
}
