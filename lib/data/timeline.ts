// Timeline ABM por empresa — PRD §8.8. Combina activities (HubSpot) +
// señales de paid (linkedin_company_engagement) en una sola línea temporal.

import { getSupabase } from "@/lib/supabase/client";
import { mockTimeline, type TimelineEvent } from "@/lib/mock-data";
import type { DbActivity, DbLinkedInCompanyEngagement } from "@/lib/supabase/types";

const KIND_TO_TYPE: Record<string, string> = {
  meeting: "Demo",
  note: "Web",
  email: "Email",
  call: "Email",
};

export async function getAccountTimeline(companyName: string): Promise<{
  account: string;
  events: TimelineEvent[];
}> {
  const sb = getSupabase();
  if (!sb) return mockTimeline;

  // Buscar la empresa por nombre.
  const { data: company } = await sb
    .from("accounts")
    .select("hubspot_company_id, name, domain")
    .ilike("name", companyName)
    .maybeSingle();

  if (!company) return mockTimeline;

  const [{ data: acts }, { data: eng }] = await Promise.all([
    sb
      .from("activities")
      .select("kind, occurred_at, body")
      .eq("hubspot_company_id", company.hubspot_company_id)
      .order("occurred_at", { ascending: true }),
    company.domain
      ? sb
          .from("linkedin_company_engagement")
          .select("level, period_start, period_end")
          .eq("domain", company.domain)
          .order("period_end", { ascending: true })
      : Promise.resolve({ data: [] as DbLinkedInCompanyEngagement[] }),
  ]);

  const events: TimelineEvent[] = [];
  for (const a of (acts ?? []) as DbActivity[]) {
    events.push({
      date: a.occurred_at.slice(0, 10),
      type: KIND_TO_TYPE[a.kind] ?? a.kind,
      detail: a.body ?? a.kind,
    });
  }
  for (const e of (eng ?? []) as DbLinkedInCompanyEngagement[]) {
    if (["Muy alto", "Alto", "Medio"].includes(e.level)) {
      events.push({
        date: e.period_end,
        type: "Ad",
        detail: `Impactada por LinkedIn Ads (${e.level})`,
      });
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date));

  if (events.length === 0) return { account: companyName, events: mockTimeline.events };
  return { account: company.name, events };
}
