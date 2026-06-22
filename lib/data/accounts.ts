// ABM Accounts — PRD §8.7. Fachada que devuelve cuentas con Heat Score
// agregado y "impactada por ads" derivado de linkedin_company_engagement.

import { getSupabase } from "@/lib/supabase/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  mockAccounts,
  mockHeatContacts,
  type AbmAccount,
} from "@/lib/mock-data";
import { computeHeat } from "@/lib/heat";
import type {
  DbAccount,
  DbActivity,
  DbHeatScore,
  DbLinkedInCompanyEngagement,
} from "@/lib/supabase/types";

export type AbmAccountLive = AbmAccount & {
  heatScore: number | null;
  heatBand: string | null;
};

function ownerName(id: string | null): string {
  if (!id) return "—";
  return id;                                 // sin tabla owners, mostramos el id
}

function mockEnriched(): AbmAccountLive[] {
  return mockAccounts.map((a) => {
    const cs = mockHeatContacts.filter((c) => c.company === a.name);
    if (cs.length === 0) return { ...a, heatScore: null, heatBand: null };
    const best = cs.map(computeHeat).reduce((x, y) => (y.score > x.score ? y : x));
    return { ...a, heatScore: best.score, heatBand: best.band };
  });
}

export async function listAccounts(): Promise<AbmAccountLive[]> {
  const sb = getSupabase();
  if (!sb) return mockEnriched();

  const { data: accs, error } = await sb.from("accounts").select("*");
  if (error || !accs || accs.length === 0) return mockEnriched();

  // Última actividad por empresa.
  const ids = (accs as DbAccount[]).map((a) => a.hubspot_company_id);
  const { data: acts } = await sb
    .from("activities")
    .select("hubspot_company_id, occurred_at")
    .in("hubspot_company_id", ids)
    .order("occurred_at", { ascending: false });
  const lastActivityByCompany = new Map<string, string>();
  for (const a of (acts ?? []) as DbActivity[]) {
    if (a.hubspot_company_id && !lastActivityByCompany.has(a.hubspot_company_id)) {
      lastActivityByCompany.set(a.hubspot_company_id, a.occurred_at);
    }
  }

  // Engagement LinkedIn vigente por empresa (impactada por ads = nivel ≥ Medio).
  const { data: eng } = await sb
    .from("linkedin_company_engagement")
    .select("*")
    .order("period_end", { ascending: false });
  const impactedByDomain = new Map<string, boolean>();
  for (const e of (eng ?? []) as DbLinkedInCompanyEngagement[]) {
    if (e.domain && !impactedByDomain.has(e.domain)) {
      impactedByDomain.set(e.domain, ["Muy alto", "Alto", "Medio"].includes(e.level));
    }
  }

  // Mejor Heat Score por empresa (vía contactos asociados).
  const { data: heat } = await sb
    .from("heat_scores")
    .select("hubspot_contact_id, score, band, contacts(company)");
  const bestHeatByCompany = new Map<string, { score: number; band: string }>();
  type HeatJoinRow = Pick<DbHeatScore, "score" | "band"> & {
    contacts: { company: string | null } | { company: string | null }[] | null;
  };
  for (const h of (heat ?? []) as unknown as HeatJoinRow[]) {
    const joined = h.contacts;
    const company = Array.isArray(joined) ? joined[0]?.company : joined?.company;
    if (!company) continue;
    const cur = bestHeatByCompany.get(company);
    if (!cur || h.score > cur.score) {
      bestHeatByCompany.set(company, { score: h.score, band: h.band });
    }
  }

  return (accs as DbAccount[]).map((a) => {
    const heat = bestHeatByCompany.get(a.name);
    return {
      name: a.name,
      domain: a.domain ?? "",
      country: a.country ?? "—",
      sdr: ownerName(a.hubspot_owner_id),
      isTargetAbm: a.is_target_abm,
      lastActivity:
        lastActivityByCompany.get(a.hubspot_company_id)?.slice(0, 10) ?? "—",
      impactedByAds: a.domain ? impactedByDomain.get(a.domain) ?? false : false,
      heatScore: heat?.score ?? null,
      heatBand: heat?.band ?? null,
    };
  });
}

export async function updateAccountAbm(
  domain: string,
  patch: { isTargetAbm?: boolean; sdr?: string },
): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  const update: Record<string, unknown> = {};
  if (patch.isTargetAbm !== undefined) update.is_target_abm = patch.isTargetAbm;
  if (patch.sdr !== undefined) update.hubspot_owner_id = patch.sdr;
  if (Object.keys(update).length === 0) return;
  await sb.from("accounts").update(update).eq("domain", domain);
}
