// Fachada de lectura para las pantallas que muestran spend × resultados.
// Devuelve siempre el mismo shape (`CampaignRow`) venga de Supabase o del mock.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import {
  mockCampaigns,
  applyOverrides,
  type CampaignRow,
  type Channel,
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

// Mapea `hs_analytics_source` (que es la "original source" de HubSpot) al
// canal interno. Sin esto la atribución solo iría a paid; pero queremos ver
// MQLs/SQLs de orgánico también en Overview.
function sourceToChannel(src: string | null): Channel | "Otros" {
  if (!src) return "Otros";
  const s = src.toUpperCase();
  if (s.includes("PAID_SOCIAL")) return "LinkedIn";
  if (s.includes("PAID_SEARCH")) return "Google";
  return "Otros";
}

// Cuando no hay paid en `ad_spend_daily`, derivamos los KPIs solo del CRM
// (contacts + deals) para que la pantalla muestre actividad real por mes.
// `spend`/`impressions`/`clicks` quedan a 0 hasta que entre Supermetrics.
async function listCRMOnlyMonthly(sb: SupabaseClient): Promise<CampaignRow[]> {
  // Una query que agrega contactos por mes y canal-derivado-de-fuente.
  const { data: contacts } = await sb
    .from("contacts")
    .select("created_at_hs, is_mql, analytics_source, country_parsed, country_raw, hubspot_contact_id")
    .limit(50000);

  if (!contacts || contacts.length === 0) return [];

  // Pre-agregamos: { (channel, month, country) -> {leads, mql} }
  type Key = string;
  type Bucket = CampaignRow;
  const buckets = new Map<Key, Bucket>();

  type ContactRow = {
    created_at_hs: string | null;
    is_mql: boolean | null;
    analytics_source: string | null;
    country_parsed: string | null;
    country_raw: string | null;
    hubspot_contact_id: string;
  };

  const contactIdsByMonth = new Map<string, Set<string>>();

  for (const c of contacts as ContactRow[]) {
    if (!c.created_at_hs) continue;
    const month = c.created_at_hs.slice(0, 7);
    const channel = sourceToChannel(c.analytics_source);
    const country = c.country_parsed || c.country_raw || "Sin país / Multi";
    const key = `${channel}|${month}|${country}`;
    const b = buckets.get(key) ?? {
      channel: channel as Channel,
      campaign: `(sin paid) ${channel}`,
      campaignGroup: null,
      country,
      month,
      spend: 0, impressions: 0, clicks: 0,
      leads: 0, mql: 0, sql: 0, pipeline: 0, closedWon: 0,
    };
    b.leads += 1;
    if (c.is_mql) b.mql += 1;
    buckets.set(key, b);

    if (!contactIdsByMonth.has(month)) contactIdsByMonth.set(month, new Set());
    contactIdsByMonth.get(month)!.add(c.hubspot_contact_id);
  }

  // Deals — agrupamos por mes y sumamos amount + closed_won.
  // Sin asociaciones contacto↔deal (el backfill manual las dejó NULL),
  // distribuimos por mes contra el bucket "Otros" del mismo mes.
  const { data: deals } = await sb
    .from("deals")
    .select("createdate, dealstage, amount, hubspot_contact_id")
    .limit(50000);

  if (deals) {
    type DealRow = {
      createdate: string | null;
      dealstage: string | null;
      amount: number;
      hubspot_contact_id: string | null;
    };
    for (const d of deals as DealRow[]) {
      if (!d.createdate) continue;
      const month = d.createdate.slice(0, 7);
      // Bucket genérico "Otros" del mes (mientras no haya asociaciones reales).
      const key = `Otros|${month}|Sin país / Multi`;
      const b = buckets.get(key) ?? {
        channel: "Otros" as Channel,
        campaign: "(sin paid) Otros",
        campaignGroup: null,
        country: "Sin país / Multi",
        month,
        spend: 0, impressions: 0, clicks: 0,
        leads: 0, mql: 0, sql: 0, pipeline: 0, closedWon: 0,
      };
      const amount = Number(d.amount ?? 0);
      if (amount > 0) b.sql += 1;
      b.pipeline += amount;
      if (d.dealstage === "closedwon") b.closedWon += amount;
      buckets.set(key, b);
    }
  }

  return [...buckets.values()];
}

export async function listCampaigns(): Promise<CampaignRow[]> {
  const sb = getSupabase();
  if (!sb) {
    const ov = await listCountryOverrides();
    return applyOverrides(mockCampaigns, ov);
  }

  // Primer intento: vista materializada (paid × CRM cross).
  const { data } = await sb
    .from("kpi_by_campaign_month")
    .select("*")
    .order("spend", { ascending: false });

  if (data && data.length > 0) {
    return (data as DbKpiByCampaignMonth[]).map(fromDbRow);
  }

  // Sin paid → derivamos del CRM (contacts + deals).
  const crmOnly = await listCRMOnlyMonthly(sb);
  return crmOnly;
}

// Overrides locales de país (Explorer) se aplican siempre encima, vengan
// los datos de mock o de la vista.
export async function listCampaignsWithOverrides(
  overrides: CountryOverrides,
): Promise<CampaignRow[]> {
  const rows = await listCampaigns();
  return applyOverrides(rows, overrides);
}
