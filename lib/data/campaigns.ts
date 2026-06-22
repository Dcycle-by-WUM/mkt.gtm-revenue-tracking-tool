// Fachada de lectura para las pantallas que muestran spend × resultados.
// Devuelve siempre el mismo shape (`CampaignRow`) venga de Supabase o del mock.

import { getSupabase } from "@/lib/supabase/client";
import {
  mockCampaigns,
  applyOverrides,
  type CampaignRow,
  type CountryOverrides,
} from "@/lib/mock-data";
import type { DbKpiByCampaignMonth } from "@/lib/supabase/types";
import { listCountryOverrides } from "@/lib/data/overrides";

function fromDbRow(r: DbKpiByCampaignMonth): CampaignRow {
  return {
    channel: r.channel,
    campaign: r.campaign,
    campaignGroup: null,                     // no entra en la vista agregada
    country: r.country,
    month: r.month,
    spend: Number(r.spend) || 0,
    impressions: Number(r.impressions) || 0,
    clicks: Number(r.clicks) || 0,
    leads: Number(r.leads) || 0,
    mql: Number(r.mql) || 0,
    sql: Number(r.sql) || 0,
    pipeline: Number(r.pipeline) || 0,
    closedWon: Number(r.closed_won) || 0,
  };
}

export async function listCampaigns(): Promise<CampaignRow[]> {
  const sb = getSupabase();
  if (!sb) {
    const ov = await listCountryOverrides();
    return applyOverrides(mockCampaigns, ov);
  }

  const { data, error } = await sb
    .from("kpi_by_campaign_month")
    .select("*")
    .order("spend", { ascending: false });

  if (error || !data || data.length === 0) {
    // Si la vista aún está vacía (ingesta no ha corrido), caemos a mock para
    // que la UI tenga algo que mostrar.
    const ov = await listCountryOverrides();
    return applyOverrides(mockCampaigns, ov);
  }

  return (data as DbKpiByCampaignMonth[]).map(fromDbRow);
}

// Overrides locales de país (Explorer) se aplican siempre encima, vengan
// los datos de mock o de la vista.
export async function listCampaignsWithOverrides(
  overrides: CountryOverrides,
): Promise<CampaignRow[]> {
  const rows = await listCampaigns();
  return applyOverrides(rows, overrides);
}
