// SEO + AEO — PRD §11. Las herramientas concretas (Moz/Ahrefs/Semrush para DA,
// Profound/Peec/Otterly/Semrush AI para AEO) siguen "on hold" en
// DECISIONES.md #6/#7, pero el modelo ya soporta desglose por motor
// (`ai_visibility.platform`) y qué URL citó cada uno (`cited_url`, migración
// 0025). Motor prioritario: Microsoft Copilot — la mayoría de clientes
// Dcycle lo usan, y Copilot se nutre del índice de Bing (de ahí que
// `organic_traffic` con `source = 'Bing'` sea relevante como salud técnica
// de indexación).
//
// Sigue el mismo patrón que lib/data/campaigns.ts: fetch de TODAS las filas
// (fallback a mock si Supabase no tiene nada), filtrado/agregación en el
// cliente vía FilterBar (país + rango de fechas monthFrom/monthTo).

import { getSupabase } from "@/lib/supabase/client";
import {
  mockOrganicTraffic, mockBingTraffic, mockAiVisibility, mockDomainAuthority,
  mockKeywordRankings, mockOrganicLeads,
} from "@/lib/mock-data";
import type { DbOrganicTraffic, DbAiVisibility } from "@/lib/supabase/types";

// Copilot primero: motor prioritario para Dcycle en la UI y en share of voice.
export const AI_ENGINES = ["Copilot", "ChatGPT", "Perplexity", "Gemini"] as const;

export type DomainAuthoritySnapshot = { da: number; provider: string };

export type KeywordRanking = { keyword: string; position: number; date: string };

export type OrganicLeadRow = {
  contactId: string;
  source: "ORGANIC_SEARCH" | "AI_REFERRALS";
  month: string; // YYYY-MM, derivado de created_at_hs
  isMql: boolean;
  dealAmount: number; // suma de deals asociados (amount_in_home_currency, fallback amount)
};

export async function listOrganicTraffic(): Promise<DbOrganicTraffic[]> {
  const sb = getSupabase();
  if (!sb) return [...mockOrganicTraffic, ...mockBingTraffic];
  const { data } = await sb.from("organic_traffic").select("*").order("date", { ascending: true });
  return data && data.length > 0 ? (data as DbOrganicTraffic[]) : [...mockOrganicTraffic, ...mockBingTraffic];
}

export async function listAiVisibility(): Promise<DbAiVisibility[]> {
  const sb = getSupabase();
  if (!sb) return mockAiVisibility;
  const { data } = await sb.from("ai_visibility").select("*").order("date", { ascending: true });
  return data && data.length > 0 ? (data as DbAiVisibility[]) : mockAiVisibility;
}

export async function getDomainAuthority(): Promise<DomainAuthoritySnapshot> {
  const sb = getSupabase();
  if (!sb) return mockDomainAuthority;
  const { data } = await sb
    .from("domain_authority")
    .select("da, provider, date")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { da: data.da, provider: data.provider } : mockDomainAuthority;
}

export async function listKeywordRankings(): Promise<KeywordRanking[]> {
  const sb = getSupabase();
  if (!sb) return mockKeywordRankings;
  const { data } = await sb
    .from("keyword_rankings")
    .select("keyword, position, date")
    .order("date", { ascending: true });
  return data && data.length > 0 ? (data as KeywordRanking[]) : mockKeywordRankings;
}

export async function listOrganicLeads(): Promise<OrganicLeadRow[]> {
  const sb = getSupabase();
  if (!sb) return mockOrganicLeads;

  const { data: contacts } = await sb
    .from("contacts")
    .select("id, hubspot_contact_id, is_mql, created_at_hs, analytics_source")
    .in("analytics_source", ["ORGANIC_SEARCH", "AI_REFERRALS"])
    .not("created_at_hs", "is", null);
  const rows = (contacts ?? []) as {
    id: string; hubspot_contact_id: string; is_mql: boolean | null;
    created_at_hs: string; analytics_source: string;
  }[];
  if (rows.length === 0) return mockOrganicLeads;

  const { data: deals } = await sb
    .from("deals")
    .select("hubspot_contact_id, amount, amount_in_home_currency")
    .in("hubspot_contact_id", rows.map((r) => r.hubspot_contact_id));
  const dealsByContact = new Map<string, number>();
  for (const d of (deals ?? []) as { hubspot_contact_id: string | null; amount: number; amount_in_home_currency: number | null }[]) {
    if (!d.hubspot_contact_id) continue;
    const amount = Number(d.amount_in_home_currency ?? d.amount ?? 0);
    dealsByContact.set(d.hubspot_contact_id, (dealsByContact.get(d.hubspot_contact_id) ?? 0) + amount);
  }

  return rows.map((r) => ({
    contactId: r.id,
    source: r.analytics_source as "ORGANIC_SEARCH" | "AI_REFERRALS",
    month: r.created_at_hs.slice(0, 7),
    isMql: Boolean(r.is_mql),
    dealAmount: dealsByContact.get(r.hubspot_contact_id) ?? 0,
  }));
}
