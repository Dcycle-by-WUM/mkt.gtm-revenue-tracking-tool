// Tipos del esquema Supabase. Reflejan las migraciones en supabase/migrations.
// Mantenerlos a mano (en lugar de generarlos con `supabase gen types`) hasta
// que el proyecto esté operativo y se cablee el CLI.

export type Channel = "LinkedIn" | "Google";

export type DbCampaign = {
  id: string;
  source: Channel;
  platform_campaign_id: string;
  campaign_group_name: string | null;
  campaign_name: string;
  campaign_name_norm: string;
  status: string | null;
  country_parsed: string | null;
  first_seen: string | null;
  last_seen: string | null;
};

export type DbAdSpendDaily = {
  source: Channel;
  platform_campaign_id: string;
  date: string;                              // YYYY-MM-DD
  campaign_id: string | null;
  campaign_group_name: string | null;
  spend: number;
  currency: string;
  impressions: number;
  clicks: number;
  synced_at: string;
};

export type DbCampaignAlias = {
  id: string;
  norm_key: string;
  campaign_id: string;
  author: string | null;
  created_at: string;
};

export type DbCountryOverride = {
  id: string;
  pattern: string;
  country: string;
  author: string | null;
  created_at: string;
};

export type DbSyncRun = {
  id: string;
  source: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "error";
  rows: number | null;
  last_covered_date: string | null;
  error_message: string | null;
};

export type DbContact = {
  id: string;
  hubspot_contact_id: string;
  email: string | null;
  firstname: string | null;
  lastname: string | null;
  company: string | null;
  jobtitle: string | null;
  hubspot_owner_id: string | null;
  lifecyclestage: string | null;
  lead_status: string | null;
  analytics_source: string | null;
  utm_campaign_raw: string | null;
  utm_campaign_norm: string | null;
  country_raw: string | null;
  country_parsed: string | null;
  is_mql: boolean | null;
  num_conversion_events: number;
  recent_conversion_date: string | null;
  recent_conversion_event_name: string | null;
  first_conversion_event_name: string | null;
  email_last_open_date: string | null;
  email_open: number;
  email_click: number;
  email_replied: number;
  page_views: number;
  email_optout: boolean;
  num_contacted_notes: number;
  created_at_hs: string | null;
  synced_at: string;
};

export type DbAccount = {
  id: string;
  hubspot_company_id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  country: string | null;
  hubspot_owner_id: string | null;
  is_target_abm: boolean;
  synced_at: string;
};

export type DbDeal = {
  id: string;
  hubspot_deal_id: string;
  amount: number;
  amount_in_home_currency: number | null;
  dealstage: string | null;
  pipeline: string | null;
  hubspot_contact_id: string | null;
  hubspot_company_id: string | null;
  createdate: string | null;
  closedate: string | null;
  synced_at: string;
};

export type DbActivity = {
  id: string;
  hubspot_engagement_id: string;
  kind: string;
  occurred_at: string;
  hubspot_contact_id: string | null;
  hubspot_company_id: string | null;
  body: string | null;
  synced_at: string;
};

export type DbHeatScore = {
  id: string;
  hubspot_contact_id: string;
  score: number;
  band: string;
  breakdown: { signal: string; points: number }[];
  eligible: boolean;
  computed_at: string;
};

export type DbLinkedInCompanyEngagement = {
  id: string;
  company_name: string;
  domain: string | null;
  level: "Muy alto" | "Alto" | "Medio" | "Bajo";
  period_start: string;
  period_end: string;
  source: string;
  synced_at: string;
};

export type DbUtmManualTag = {
  id: string;
  utm_norm: string;
  campaign_id: string;
  author: string;
  created_at: string;
};

export type DbCampaignTag = {
  campaign_id: string;
  tag: string;
  author: string;
  created_at: string;
};

export type DbTarget = {
  id: string;
  channel: Channel;
  month: string;                             // YYYY-MM
  country: string;
  target_spend: number;
  target_pipeline: number;
  author: string;
  updated_at: string;
};

export type DbNote = {
  id: string;
  target_kind: "campaign" | "account" | "contact" | "deal";
  target_key: string;
  body: string;
  author: string;
  updated_at: string;
};

export type DbAppUser = {
  id: string;
  email: string;
  display_name: string | null;
  role: "admin" | "marketing" | "sdr" | "readonly";
  created_at: string;
};

export type DbHeatWeights = {
  id: string;
  name: string;
  weights: Record<string, unknown>;
  thresholds: Record<string, number>;
  is_active: boolean;
  author: string;
  created_at: string;
};

export type DbKpiByCampaignMonth = {
  channel: Channel;
  campaign: string;
  country: string;
  month: string;                             // YYYY-MM
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  mql: number;
  sql: number;
  pipeline: number;
  closed_won: number;
};

export type DbKpiByChannelMonth = {
  channel: Channel;
  country: string;
  month: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  mql: number;
  sql: number;
  pipeline: number;
  closed_won: number;
};

// Bucket orgánico (no paid) — migración 0009. Sin `channel` propio en DB
// (no viene de `campaigns.source`); se etiqueta "Otros" al mapear a CampaignRow.
export type DbKpiOrganicByMonth = {
  country: string;
  month: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  mql: number;
  sql: number;
  pipeline: number;
  closed_won: number;
};

export type DbOrganicTraffic = {
  id: string;
  source: "GSC" | "GA4" | "Bing";
  date: string;
  query: string | null;
  page: string | null;
  country: string | null;
  impressions: number;
  clicks: number;
  position_avg: number | null;
  is_branded: boolean | null;
  synced_at: string;
};

export type DbAiVisibility = {
  id: string;
  date: string;
  prompt: string;
  appeared: boolean;
  rank_in_answer: number | null;
  competitors: { name: string; appeared: boolean; rank: number | null }[];
  platform: string;
  synced_at: string;
};
