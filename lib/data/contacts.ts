// Contactos + ranking Heat — PRD §8.9.

import { getSupabase } from "@/lib/supabase/client";
import { mockHeatContacts } from "@/lib/mock-data";
import { computeHeat, isEligible, type HeatContact, type HeatResult } from "@/lib/heat";
import type { DbContact, DbHeatScore } from "@/lib/supabase/types";

export type HeatRanked = {
  contact: HeatContact;
  eligible: boolean;
  heat: HeatResult;
};

function fromDb(c: DbContact): HeatContact {
  return {
    email: c.email ?? "",
    company: c.company ?? "—",
    jobTitle: c.jobtitle ?? "",
    country: c.country_parsed ?? c.country_raw ?? "—",
    ownerSdr: c.hubspot_owner_id ?? "—",
    numConversionEvents: c.num_conversion_events,
    recentConversionDate: c.recent_conversion_date,
    recentConversionEventName: c.recent_conversion_event_name ?? "",
    firstConversionEventName: c.first_conversion_event_name ?? "",
    emailLastOpenDate: c.email_last_open_date,
    emailOpen: c.email_open,
    emailClick: c.email_click,
    emailReplied: c.email_replied,
    pageViews: c.page_views,
    linkedinEngagement: null,                 // se cruza fuera de la consulta
    lifecycleStage: c.lifecyclestage ?? "",
    leadStatus: c.lead_status ?? "",
    emailOptout: c.email_optout,
    numContactedNotes: c.num_contacted_notes,
  };
}

export async function listHeatRanking(): Promise<HeatRanked[]> {
  const sb = getSupabase();
  if (!sb) return [];

  // Si hay heat_scores precalculados, los usamos; si no, calculamos en runtime.
  const { data: scored } = await sb
    .from("heat_scores")
    .select("score, band, breakdown, eligible, contacts(*)")
    .order("score", { ascending: false })
    .limit(200);

  if (scored && scored.length > 0) {
    type Row = Pick<DbHeatScore, "score" | "band" | "breakdown" | "eligible"> & {
      contacts: DbContact | DbContact[] | null;
    };
    return (scored as unknown as Row[])
      .map((s) => {
        const c = Array.isArray(s.contacts) ? s.contacts[0] : s.contacts;
        if (!c) return null;
        return {
          contact: fromDb(c),
          eligible: s.eligible,
          heat: { score: s.score, band: s.band as HeatResult["band"], breakdown: s.breakdown },
        };
      })
      .filter((x): x is HeatRanked => x !== null);
  }

  const { data: contacts } = await sb.from("contacts").select("*").limit(500);
  const mapped = (contacts ?? []).map((c) => fromDb(c as DbContact));
  return mapped
    .map((c) => ({ contact: c, eligible: isEligible(c), heat: computeHeat(c) }))
    .sort((a, b) => b.heat.score - a.heat.score);
}
