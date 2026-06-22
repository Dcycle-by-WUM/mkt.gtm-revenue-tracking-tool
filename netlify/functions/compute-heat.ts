// Recalcula Heat Score para todos los contactos elegibles (PRD §10).
// Persiste en `heat_scores` con breakdown y banda. Lee LinkedIn Companies
// Engagement Report para el componente "empresa engaged".

import type { Config } from "@netlify/functions";
import { requireSupabaseAdmin } from "@/lib/supabase/admin";
import { computeHeat, isEligible, type HeatContact } from "@/lib/heat";
import type { DbContact, DbLinkedInCompanyEngagement } from "@/lib/supabase/types";

function dbToHeat(c: DbContact, liLevel: HeatContact["linkedinEngagement"]): HeatContact {
  return {
    email: c.email ?? "",
    company: c.company ?? "",
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
    linkedinEngagement: liLevel,
    lifecycleStage: c.lifecyclestage ?? "",
    leadStatus: c.lead_status ?? "",
    emailOptout: c.email_optout,
    numContactedNotes: c.num_contacted_notes,
  };
}

export default async (): Promise<Response> => {
  const sb = requireSupabaseAdmin();

  const { data: contacts } = await sb.from("contacts").select("*");
  if (!contacts || contacts.length === 0) {
    return new Response(JSON.stringify({ ok: true, scored: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const { data: engagement } = await sb
    .from("linkedin_company_engagement")
    .select("company_name, level, period_end")
    .order("period_end", { ascending: false });

  const liByCompany = new Map<string, HeatContact["linkedinEngagement"]>();
  for (const e of (engagement ?? []) as DbLinkedInCompanyEngagement[]) {
    if (e.company_name && !liByCompany.has(e.company_name)) {
      const lvl = e.level === "Bajo" ? null : e.level;
      liByCompany.set(e.company_name, lvl);
    }
  }

  const records: {
    hubspot_contact_id: string;
    score: number;
    band: string;
    breakdown: { signal: string; points: number }[];
    eligible: boolean;
    computed_at: string;
  }[] = [];

  for (const c of contacts as DbContact[]) {
    const li = c.company ? liByCompany.get(c.company) ?? null : null;
    const heat = dbToHeat(c, li);
    const result = computeHeat(heat);
    records.push({
      hubspot_contact_id: c.hubspot_contact_id,
      score: result.score,
      band: result.band,
      breakdown: result.breakdown,
      eligible: isEligible(heat),
      computed_at: new Date().toISOString(),
    });
  }

  for (let i = 0; i < records.length; i += 200) {
    await sb.from("heat_scores").upsert(records.slice(i, i + 200), {
      onConflict: "hubspot_contact_id",
    });
  }

  return new Response(JSON.stringify({ ok: true, scored: records.length }), {
    headers: { "Content-Type": "application/json" },
  });
};

export const config: Config = {
  schedule: "0 */2 * * *",                    // cada 2h
};
