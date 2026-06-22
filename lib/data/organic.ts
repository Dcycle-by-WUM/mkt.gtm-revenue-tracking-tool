// SEO + AEO — PRD §11. Las herramientas concretas (Moz/Ahrefs/Semrush para DA,
// Profound/Peec/Otterly/Semrush AI para AEO) están "on hold" en DECISIONES.md,
// pero el modelo de datos ya está en su sitio para enchufarlas.

import { getSupabase } from "@/lib/supabase/client";
import { mockSeoKpis, mockAeoKpis } from "@/lib/mock-data";
import { fmtEur, fmtNum } from "@/lib/kpis";
import type { DbOrganicTraffic, DbAiVisibility } from "@/lib/supabase/types";

export type OrganicKpi = { kpi: string; value: string; source: string };

function pct(n: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((n / total) * 100)} %`;
}

export async function getSeoKpis(month: string): Promise<OrganicKpi[]> {
  const sb = getSupabase();
  if (!sb) return mockSeoKpis;

  const { data: traffic } = await sb
    .from("organic_traffic")
    .select("source, clicks, impressions, is_branded")
    .gte("date", `${month}-01`)
    .lte("date", `${month}-31`);

  const t = (traffic ?? []) as Pick<DbOrganicTraffic, "source" | "clicks" | "impressions" | "is_branded">[];
  if (t.length === 0) return mockSeoKpis;

  const sessions = t.filter((r) => !r.is_branded).reduce((s, r) => s + (r.clicks ?? 0), 0);

  // Domain Authority — última snapshot.
  const { data: da } = await sb
    .from("domain_authority")
    .select("da, provider, date")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Keywords en top 3 — último día con datos.
  const { data: kw } = await sb
    .from("keyword_rankings")
    .select("keyword, position, date")
    .lte("position", 3)
    .gte("date", `${month}-01`)
    .lte("date", `${month}-31`);
  const top3 = new Set((kw ?? []).map((k: { keyword: string }) => k.keyword)).size;

  // Leads + pipeline orgánicos (vienen de contacts con analytics_source).
  const { data: leadsOrg } = await sb
    .from("contacts")
    .select("id, is_mql")
    .eq("analytics_source", "ORGANIC_SEARCH")
    .gte("created_at_hs", `${month}-01`)
    .lte("created_at_hs", `${month}-31`);
  const leads = leadsOrg?.length ?? 0;
  const mql = leadsOrg?.filter((c: { is_mql: boolean | null }) => c.is_mql).length ?? 0;

  const { data: pipelineRows } = await sb
    .from("deals")
    .select("amount, hubspot_contact_id, contacts!inner(analytics_source)")
    .eq("contacts.analytics_source", "ORGANIC_SEARCH");
  const pipelineEur = (pipelineRows ?? []).reduce(
    (s: number, d: { amount: number }) => s + Number(d.amount ?? 0),
    0,
  );

  return [
    { kpi: "Tráfico orgánico non-branded", value: `${fmtNum(sessions)} sesiones`, source: "GSC + GA4" },
    {
      kpi: "Domain Authority (DA)",
      value: da ? `${da.da} (${da.provider})` : "—",
      source: "Moz/Ahrefs/Semrush",
    },
    { kpi: "Keywords estratégicas en Top 3", value: fmtNum(top3), source: "GSC / rank tracker" },
    { kpi: "Leads orgánicos", value: fmtNum(leads), source: "HubSpot" },
    { kpi: "MQL orgánicos", value: fmtNum(mql), source: "HubSpot" },
    { kpi: "Pipeline SEO €", value: fmtEur(pipelineEur), source: "HubSpot" },
  ];
}

export async function getAeoKpis(month: string): Promise<OrganicKpi[]> {
  const sb = getSupabase();
  if (!sb) return mockAeoKpis;

  const { data: ai } = await sb
    .from("ai_visibility")
    .select("appeared, competitors")
    .gte("date", `${month}-01`)
    .lte("date", `${month}-31`);

  const rows = (ai ?? []) as unknown as DbAiVisibility[];
  const total = rows.length;
  if (total === 0) return mockAeoKpis;
  const appeared = rows.filter((r) => r.appeared).length;
  const ourSov = appeared;
  const competitorsAppeared = rows.reduce(
    (s, r) => s + r.competitors.filter((c) => c.appeared).length,
    0,
  );
  const sov = pct(ourSov, ourSov + competitorsAppeared);

  // Leads/pipeline desde IA (analytics_source = AI_REFERRALS) + Bing.
  const { data: aiLeads } = await sb
    .from("contacts")
    .select("id")
    .eq("analytics_source", "AI_REFERRALS")
    .gte("created_at_hs", `${month}-01`)
    .lte("created_at_hs", `${month}-31`);
  const { data: aiPipelineRows } = await sb
    .from("deals")
    .select("amount, contacts!inner(analytics_source)")
    .eq("contacts.analytics_source", "AI_REFERRALS");
  const aiPipeline = (aiPipelineRows ?? []).reduce(
    (s: number, d: { amount: number }) => s + Number(d.amount ?? 0),
    0,
  );

  const { data: bing } = await sb
    .from("organic_traffic")
    .select("impressions")
    .eq("source", "Bing")
    .gte("date", `${month}-01`)
    .lte("date", `${month}-31`);
  const bingImpressions = (bing ?? []).reduce(
    (s: number, r: { impressions: number }) => s + (r.impressions ?? 0),
    0,
  );

  return [
    { kpi: "AI Visibility", value: pct(appeared, total), source: "Plataforma AI-visibility" },
    { kpi: "AI Share of Voice", value: sov, source: "Plataforma AI-visibility" },
    { kpi: "Leads desde IA (AI_REFERRALS)", value: fmtNum(aiLeads?.length ?? 0), source: "HubSpot" },
    { kpi: "Pipeline desde IA €", value: fmtEur(aiPipeline), source: "HubSpot" },
    { kpi: "Bing — impresiones", value: fmtNum(bingImpressions), source: "Bing WMT" },
  ];
}
