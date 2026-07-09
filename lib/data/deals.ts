// Fachada de lectura de `deal_attribution` (migración 0014) — grano deal.
// Alimenta la pantalla /deals: pipeline por deal con su canal/campaña/país
// y la cohorte del contacto (¿viene de un lead captado en 2026 o de una
// cuenta histórica?).

import { getSupabase } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetch-all";
import type { DbDealAttribution } from "@/lib/supabase/types";
import { normalizeCountryLabel } from "@/lib/regions";

export type DealRow = {
  dealId: string;
  dealname: string;
  month: string;
  amount: number;
  dealstage: string | null;
  isClosedWon: boolean;
  pipelineLabel: string;
  channel: string;
  campaign: string | null;
  country: string;
  contactCreatedMonth: string | null;
};

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
  { dealId: "m1", dealname: "Acme Logistics - SaaS ESG", month: "2026-06", amount: 24000, dealstage: "proposal", isClosedWon: false, pipelineLabel: "AE Pipeline", channel: "LinkedIn", campaign: "esp_mensaje_españa_documento [mofu]", country: "ES", contactCreatedMonth: "2026-04" },
  { dealId: "m2", dealname: "Verde Retail - HC + CSRD", month: "2026-06", amount: 18000, dealstage: "closedwon", isClosedWon: true, pipelineLabel: "AE Pipeline", channel: "Google", campaign: "lm_calculadora-hdc-2025-es", country: "ES", contactCreatedMonth: "2026-03" },
  { dealId: "m3", dealname: "Nordwind GmbH - PPWR", month: "2026-06", amount: 31000, dealstage: "negotiation", isClosedWon: false, pipelineLabel: "International Pipeline", channel: "Otros", campaign: null, country: "DE", contactCreatedMonth: "2025-11" },
  { dealId: "m4", dealname: "Portola Foods - Upsell reporting", month: "2026-05", amount: 12500, dealstage: "qualification", isClosedWon: false, pipelineLabel: "AE Pipeline", channel: "Otros", campaign: null, country: "ES", contactCreatedMonth: null },
];

function fromDbRow(r: DbDealAttribution): DealRow {
  return {
    dealId: r.hubspot_deal_id,
    dealname: r.dealname,
    month: r.month,
    amount: Number(r.amount) || 0,
    dealstage: r.dealstage,
    isClosedWon: r.is_closed_won,
    pipelineLabel: r.pipeline_label,
    channel: r.channel,
    campaign: r.campaign,
    country: normalizeCountryLabel(r.country),
    contactCreatedMonth: r.contact_created_month,
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
