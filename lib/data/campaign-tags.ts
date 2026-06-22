// Etiquetas libres por campaña (Webinar, MOFU…) — usadas en Campaign Detail
// para hacer rollups por etiqueta.

import { getSupabase } from "@/lib/supabase/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function listCampaignTags(): Promise<Record<string, string[]>> {
  const sb = getSupabase();
  if (!sb) return {};
  // Aquí "campaign" se identifica por nombre canónico para que la UI no tenga
  // que conocer UUIDs; cuando haya datos reales se hace join con campaigns.
  const { data, error } = await sb
    .from("campaign_tags")
    .select("tag, campaign_id, campaigns(campaign_name)");
  if (error || !data) return {};
  const out: Record<string, string[]> = {};
  type Row = { tag: string; campaigns: { campaign_name: string } | { campaign_name: string }[] | null };
  for (const r of data as unknown as Row[]) {
    const joined = r.campaigns;
    const name = Array.isArray(joined) ? joined[0]?.campaign_name : joined?.campaign_name;
    if (!name) continue;
    (out[name] ??= []).push(r.tag);
  }
  return out;
}

export async function setCampaignTagsByName(
  campaignName: string,
  tags: string[],
): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const { data: c } = await sb
    .from("campaigns")
    .select("id")
    .eq("campaign_name", campaignName)
    .maybeSingle();
  if (!c) return;
  // Reemplaza el set: borra los actuales y mete los nuevos.
  await sb.from("campaign_tags").delete().eq("campaign_id", c.id);
  if (tags.length === 0) return;
  await sb.from("campaign_tags").insert(
    tags.map((tag) => ({ campaign_id: c.id, tag, author: "anonymous@dev" })),
  );
}
