// Fachada de lectura de `deal_attribution` (migración 0014) — grano deal.
// Alimenta la pantalla /deals: pipeline por deal con su canal/campaña/país
// y la cohorte del contacto (¿viene de un lead captado en 2026 o de una
// cuenta histórica?).

import { getSupabase } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetch-all";
import type { DbDealAttribution } from "@/lib/supabase/types";
import { normalizeCountryLabel } from "@/lib/regions";
import { parseWebinarList, addMonths, type Webinar } from "@/lib/webinars";

export type DealRow = {
  dealId: string;
  dealname: string;
  month: string;
  amount: number;
  dealstage: string | null;
  isClosedWon: boolean;
  isClosed: boolean;
  pipelineId: string | null;
  pipelineLabel: string;
  // Región de negocio por pipeline (AE → Spain, International → Rest of
  // International). Manda sobre regionOf(country) al filtrar por región:
  // un contacto alemán en International Pipeline NO es DACH.
  businessRegion: string | null;
  channel: string;
  // 'contacto' = el deal tiene fuente OFFLINE (creado a mano por sales)
  // pero entra como inbound por su contacto Inbound (migración 0020).
  attributionVia: "deal" | "contacto";
  campaign: string | null;
  country: string;
  contactCreatedMonth: string | null;
  // Compelling event: TODOS los webinars a los que está inscrita la empresa del
  // deal (contacto guardado + cualquier contacto del mismo dominio; se resuelve
  // en la vista `deal_attribution`). Sin filtro de fecha: interesa saber a qué
  // webinars ha asistido la empresa aunque el webinar sea posterior al deal.
  // `compelling` marca el subconjunto fuerte: deal abierto el mismo mes o el
  // siguiente al webinar. Independiente de campaña/UTM. Ver `webinarsForDeal`.
  webinars: DealWebinar[];
};

// Webinar de un deal, con la marca de "compelling event".
export type DealWebinar = Webinar & { compelling: boolean };

// Compelling event = el deal se abrió el MISMO mes o el SIGUIENTE al webinar
// (`dealMonth ∈ {ym, ym+1}`) — señal fuerte de que el webinar movió el deal.
// Sin mes codificado en el código no se puede datar → no es compelling.
export function isCompellingWebinar(dealMonth: string, ym: string | null): boolean {
  if (!ym) return false;
  return dealMonth === ym || dealMonth === addMonths(ym, 1);
}

// Todos los webinars inscritos de la empresa del deal, anotados con `compelling`.
// Ya no se filtra por fecha: se muestran todos, y el marcador distingue el
// subconjunto compelling.
export function webinarsForDeal(raw: string | null, dealMonth: string): DealWebinar[] {
  return parseWebinarList(raw).map((w) => ({ ...w, compelling: isCompellingWebinar(dealMonth, w.ym) }));
}

// Estado del deal para la pantalla: abierto / ganado / perdido.
export type DealState = "abierto" | "ganado" | "cerrado";

export function dealState(row: Pick<DealRow, "isClosedWon" | "isClosed">): DealState {
  if (row.isClosedWon) return "ganado";
  return row.isClosed ? "cerrado" : "abierto";
}

// Cohorte del lead que originó el deal. El corte "2026" responde a la
// pregunta de negocio "¿qué deals vienen del esfuerzo reciente de mktg?";
// "histórico" = contacto anterior, "sin contacto" = deal sin contacto
// asociado ingerido (no se puede saber).
export type LeadCohort = "2026" | "histórico" | "sin contacto";

export function leadCohort(row: Pick<DealRow, "contactCreatedMonth">): LeadCohort {
  if (!row.contactCreatedMonth) return "sin contacto";
  return row.contactCreatedMonth >= "2026-01" ? "2026" : "histórico";
}

// Dataset de ejemplo para cuando Supabase no está vivo (mismo criterio que
// el resto de fachadas: la pantalla enseña algo coherente con el mock).
const mockDeals: DealRow[] = [
  { dealId: "m1", dealname: "Acme Logistics - SaaS ESG", month: "2026-06", amount: 24000, dealstage: "proposal", isClosedWon: false, isClosed: false, pipelineId: "7888791", pipelineLabel: "AE Pipeline", businessRegion: "Spain", channel: "LinkedIn", attributionVia: "deal", campaign: "esp_mensaje_españa_documento [mofu]", country: "ES", contactCreatedMonth: "2026-04", webinars: webinarsForDeal("wb_einf_feb26", "2026-06") },
  { dealId: "m2", dealname: "Verde Retail - HC + CSRD", month: "2026-06", amount: 18000, dealstage: "closedwon", isClosedWon: true, isClosed: true, pipelineId: "7888791", pipelineLabel: "AE Pipeline", businessRegion: "Spain", channel: "Google", attributionVia: "deal", campaign: "lm_calculadora-hdc-2025-es", country: "ES", contactCreatedMonth: "2026-03", webinars: webinarsForDeal("wb_ia-cdp-ecovadis_may26;wb_datos-csrd_sep26", "2026-06") },
  { dealId: "m3", dealname: "Nordwind GmbH - PPWR", month: "2026-06", amount: 31000, dealstage: "negotiation", isClosedWon: false, isClosed: false, pipelineId: "727373069", pipelineLabel: "International Pipeline", businessRegion: "Rest of International", channel: "Otros", attributionVia: "deal", campaign: null, country: "DE", contactCreatedMonth: "2025-11", webinars: [] },
  { dealId: "m4", dealname: "Portola Foods - Upsell reporting", month: "2026-05", amount: 12500, dealstage: "qualification", isClosedWon: false, isClosed: false, pipelineId: "7888791", pipelineLabel: "AE Pipeline", businessRegion: "Spain", channel: "Otros", attributionVia: "deal", campaign: null, country: "ES", contactCreatedMonth: null, webinars: [] },
];

function fromDbRow(r: DbDealAttribution): DealRow {
  return {
    dealId: r.hubspot_deal_id,
    dealname: r.dealname,
    month: r.month,
    amount: Number(r.amount) || 0,
    dealstage: r.dealstage,
    isClosedWon: r.is_closed_won,
    isClosed: r.is_closed,
    pipelineId: r.pipeline_id,
    pipelineLabel: r.pipeline_label,
    businessRegion: r.business_region,
    channel: r.channel,
    attributionVia: r.attribution_via ?? "deal",
    campaign: r.campaign,
    country: normalizeCountryLabel(r.country),
    contactCreatedMonth: r.contact_created_month,
    webinars: webinarsForDeal(r.webinars_registrado, r.month),
  };
}

export async function listDealAttribution(): Promise<DealRow[]> {
  const sb = getSupabase();
  if (!sb) return mockDeals;
  const rows = await fetchAll<DbDealAttribution>(
    () => sb.from("deal_attribution").select("*").order("month", { ascending: false }),
  );
  return rows.map(fromDbRow);
}

// Pipe INBOUND por (pipeline, mes) — suma de `deal_attribution` (ya scoped a
// inbound) agrupada por pipeline_id y mes. Sirve para el % de inbound sobre el
// pipe total (listPipelineTotals): inbound ⊆ total por construcción, así que el
// cociente nunca pasa de 100%. Reaprovecha listDealAttribution (mock/Supabase).
export type InboundPipelineTotal = { pipelineId: string; month: string; amount: number };

export async function listInboundPipelineTotals(): Promise<InboundPipelineTotal[]> {
  const deals = await listDealAttribution();
  const acc = new Map<string, InboundPipelineTotal>();
  for (const d of deals) {
    if (!d.pipelineId) continue; // sin id de pipeline no se puede casar con el total
    const key = `${d.month}|${d.pipelineId}`;
    const cur = acc.get(key);
    if (cur) cur.amount += d.amount;
    else acc.set(key, { pipelineId: d.pipelineId, month: d.month, amount: d.amount });
  }
  return [...acc.values()];
}
