// Fachada de lectura para las pantallas que muestran spend × resultados.
// Devuelve siempre el mismo shape (`CampaignRow`) venga de Supabase o del mock.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetch-all";
import {
  mockCampaigns,
  applyOverrides,
  type CampaignRow,
  type Channel,
  type CountryOverrides,
} from "@/lib/mock-data";
import type { DbKpiByCampaignMonth, DbKpiOrganicByMonth } from "@/lib/supabase/types";
import { listCountryOverrides } from "@/lib/data/overrides";
import { listCountryGroups } from "@/lib/data/regions";
import { normalizeCountryLabel, collapseCountry } from "@/lib/regions";

function fromDbRow(r: DbKpiByCampaignMonth): CampaignRow {
  return {
    channel: r.channel,
    campaign: r.campaign,
    campaignGroup: null,                     // no entra en la vista agregada
    country: normalizeCountryLabel(r.country),
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

// `kpi_organic_by_month` (migración 0009) corre siempre, en paralelo a la
// paid — no como fallback — para que los leads orgánicos no desaparezcan de
// Overview en cuanto entra spend de LinkedIn/Google.
function fromOrganicDbRow(r: DbKpiOrganicByMonth): CampaignRow {
  return {
    channel: "Otros",
    campaign: "(orgánico)",
    campaignGroup: null,
    country: normalizeCountryLabel(r.country),
    month: r.month,
    spend: 0,
    impressions: Number(r.impressions) || 0,
    clicks: Number(r.clicks) || 0,
    leads: Number(r.leads) || 0,
    mql: Number(r.mql) || 0,
    sql: Number(r.sql) || 0,
    pipeline: Number(r.pipeline) || 0,
    closedWon: Number(r.closed_won) || 0,
  };
}

async function listOrganicRows(sb: SupabaseClient): Promise<CampaignRow[]> {
  const { data } = await sb.from("kpi_organic_by_month").select("*");
  if (!data) return [];
  return (data as DbKpiOrganicByMonth[]).map(fromOrganicDbRow);
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
type ContactRow = {
  created_at_hs: string | null;
  is_mql: boolean | null;
  analytics_source: string | null;
  country_parsed: string | null;
  country_raw: string | null;
  hubspot_contact_id: string;
};

type DealRow = {
  createdate: string | null;
  dealstage: string | null;
  amount: number;
  hubspot_contact_id: string | null;
};

async function listCRMOnlyMonthly(sb: SupabaseClient): Promise<CampaignRow[]> {
  const contacts = await fetchAll<ContactRow>(
    () => sb.from("contacts").select("created_at_hs, is_mql, analytics_source, country_parsed, country_raw, hubspot_contact_id"),
  );

  if (contacts.length === 0) return [];

  type Key = string;
  type Bucket = CampaignRow;
  const buckets = new Map<Key, Bucket>();
  const contactIdsByMonth = new Map<string, Set<string>>();

  for (const c of contacts) {
    if (!c.created_at_hs) continue;
    const month = c.created_at_hs.slice(0, 7);
    const channel = sourceToChannel(c.analytics_source);
    const country = normalizeCountryLabel(c.country_parsed || c.country_raw || "Sin país / Multi");
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
  const deals = await fetchAll<DealRow>(
    () => sb.from("deals").select("createdate, dealstage, amount, hubspot_contact_id"),
  );

  if (deals.length > 0) {
    for (const d of deals) {
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

  // Paid (vista materializada, paid × CRM cross) + Orgánico corren siempre
  // en paralelo — el orgánico NO es un fallback del paid, son buckets
  // independientes que se muestran juntos.
  const [paidRes, organicRows] = await Promise.all([
    sb.from("kpi_by_campaign_month").select("*").order("spend", { ascending: false }),
    listOrganicRows(sb),
  ]);

  const paidRows = paidRes.data && paidRes.data.length > 0
    ? (paidRes.data as DbKpiByCampaignMonth[]).map(fromDbRow)
    : [];

  if (paidRows.length > 0 || organicRows.length > 0) {
    return collapseNonPaidCountries([...paidRows, ...organicRows]);
  }

  // Ni paid ni orgánico (ningún sync ha corrido todavía) → derivar del CRM
  // crudo para que la pantalla muestre algo mientras tanto.
  const crmOnly = await listCRMOnlyMonthly(sb);
  return collapseNonPaidCountries(crmOnly);
}

// La cola larga de países que solo aportan leads orgánicos sueltos (India,
// Estonia, Brasil… sin campaña paid NI pipeline) no merece fila propia en
// pivots y listados: se colapsa en un bucket por región ("Otros · Rest of
// International"). Un país SÍ conserva su fila si tiene actividad paid o
// dinero atribuido (SQL/pipeline) — eso es señal, no ruido. El filtro de
// región sigue encontrando las filas colapsadas (regionOf entiende el
// prefijo). Decisión Davide, 10-jul.
async function collapseNonPaidCountries(rows: CampaignRow[]): Promise<CampaignRow[]> {
  const groups = await listCountryGroups();
  const keep = new Set<string>(["Sin país / Multi"]);   // bucket propio
  const money = new Map<string, number>();
  for (const r of rows) {
    if (r.channel !== "Otros") keep.add(r.country);
    money.set(r.country, (money.get(r.country) ?? 0) + r.pipeline + r.sql);
  }
  for (const [country, m] of money) if (m > 0) keep.add(country);
  return rows.map((r) =>
    keep.has(r.country) ? r : { ...r, country: collapseCountry(r.country, groups) },
  );
}

// Overrides locales de país (Explorer) se aplican siempre encima, vengan
// los datos de mock o de la vista.
export async function listCampaignsWithOverrides(
  overrides: CountryOverrides,
): Promise<CampaignRow[]> {
  const rows = await listCampaigns();
  return applyOverrides(rows, overrides);
}

// Lista ligera (id + nombre) de la dimensión `campaigns`, para el selector
// de "asignar alias" en Data Health. No pasa por la vista de KPIs.
export type CampaignOption = {
  id: string;
  name: string;
  source: Channel;
  country: string | null;
};

export async function listCampaignOptions(): Promise<CampaignOption[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const rows = await fetchAll<{ id: string; campaign_name: string; source: Channel; country_parsed: string | null }>(
    () => sb.from("campaigns").select("id, campaign_name, source, country_parsed").order("campaign_name"),
  );
  return rows.map((r) => ({ id: r.id, name: r.campaign_name, source: r.source, country: r.country_parsed }));
}
