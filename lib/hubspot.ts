// Ingesta de HubSpot — PRD §6 / §6.1.
// Bloqueado hasta que llegue HUBSPOT_PRIVATE_APP_TOKEN. Scopes mínimos
// (todo lectura):
//   - crm.objects.contacts.read
//   - crm.objects.deals.read
//   - crm.objects.companies.read
//   - crm.objects.owners.read
//   - crm.schemas.contacts.read
//
// Toda la ingesta corre server-side. Idempotente aguas abajo (upsert por
// hubspot_*_id). El job principal `compute-mql + utm_campaign_norm` se hace
// aquí antes de escribir en `contacts`.

import { normalizeUtm } from "@/lib/matching";

const HUBSPOT_BASE = "https://api.hubapi.com";

function requireToken(): string {
  const t = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
  if (!t) {
    throw new Error(
      "HUBSPOT_PRIVATE_APP_TOKEN no configurada. Se conecta cuando esté la app construida.",
    );
  }
  return t;
}

const PROPS_CONTACT = [
  "email", "firstname", "lastname", "company", "jobtitle",
  "hubspot_owner_id", "lifecyclestage", "hs_lead_status",
  "hs_analytics_source", "utm_campaign", "country",
  "num_conversion_events", "recent_conversion_date",
  "recent_conversion_event_name", "first_conversion_event_name",
  "hs_email_last_open_date", "hs_email_open", "hs_email_click",
  "hs_email_replied", "hs_analytics_num_page_views",
  "hs_email_optout", "num_contacted_notes", "createdate",
] as const;

const PROPS_DEAL = [
  "amount", "amount_in_home_currency", "dealstage", "pipeline",
  "createdate", "closedate",
] as const;

const PROPS_COMPANY = [
  "name", "domain", "industry", "country",
  "hubspot_owner_id", "is_target_abm",
] as const;

export type HsContact = {
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
};

// Regla MQL (DECISIONES.md #1): MQL = lead_status ∉ {"MK NOT QUALIFIED", vacío}
function deriveMql(leadStatus: string | null): boolean {
  if (!leadStatus) return false;
  const v = leadStatus.trim();
  if (!v) return false;
  return v.toUpperCase() !== "MK NOT QUALIFIED";
}

type HsPage<T> = { results: T[]; paging?: { next?: { after: string } } };
type HsRecord = { id: string; properties: Record<string, string | null> };

async function hsFetch<T>(path: string, qs: Record<string, string | string[]>): Promise<T> {
  const token = requireToken();
  const url = new URL(`${HUBSPOT_BASE}${path}`);
  for (const [k, v] of Object.entries(qs)) {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`HubSpot ${path} → ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as T;
}

async function pageAll<T>(
  path: string,
  baseQs: Record<string, string | string[]>,
): Promise<T[]> {
  const all: T[] = [];
  let after: string | undefined;
  for (let i = 0; i < 50; i++) {                  // tope de seguridad: 5k filas/run
    const qs = { ...baseQs, limit: "100", ...(after ? { after } : {}) };
    const page = (await hsFetch(path, qs)) as HsPage<T>;
    all.push(...page.results);
    after = page.paging?.next?.after;
    if (!after) break;
  }
  return all;
}

function mapContact(r: HsRecord): HsContact {
  const p = r.properties;
  const utmRaw = p.utm_campaign ?? null;
  return {
    hubspot_contact_id: r.id,
    email: p.email,
    firstname: p.firstname,
    lastname: p.lastname,
    company: p.company,
    jobtitle: p.jobtitle,
    hubspot_owner_id: p.hubspot_owner_id,
    lifecyclestage: p.lifecyclestage,
    lead_status: p.hs_lead_status,
    analytics_source: p.hs_analytics_source,
    utm_campaign_raw: utmRaw,
    utm_campaign_norm: utmRaw ? normalizeUtm(utmRaw) : null,
    country_raw: p.country,
    is_mql: deriveMql(p.hs_lead_status),
    num_conversion_events: Number(p.num_conversion_events ?? 0),
    recent_conversion_date: p.recent_conversion_date,
    recent_conversion_event_name: p.recent_conversion_event_name,
    first_conversion_event_name: p.first_conversion_event_name,
    email_last_open_date: p.hs_email_last_open_date,
    email_open: Number(p.hs_email_open ?? 0),
    email_click: Number(p.hs_email_click ?? 0),
    email_replied: Number(p.hs_email_replied ?? 0),
    page_views: Number(p.hs_analytics_num_page_views ?? 0),
    email_optout: p.hs_email_optout === "true",
    num_contacted_notes: Number(p.num_contacted_notes ?? 0),
    created_at_hs: p.createdate,
  };
}

export async function fetchContacts(): Promise<HsContact[]> {
  const records = await pageAll<HsRecord>("/crm/v3/objects/contacts", {
    properties: [...PROPS_CONTACT],
  });
  return records.map(mapContact);
}

export type HsDeal = {
  hubspot_deal_id: string;
  amount: number;
  amount_in_home_currency: number | null;
  dealstage: string | null;
  pipeline: string | null;
  hubspot_contact_id: string | null;
  hubspot_company_id: string | null;
  createdate: string | null;
  closedate: string | null;
};

export async function fetchDeals(): Promise<HsDeal[]> {
  const records = await pageAll<HsRecord & {
    associations?: {
      contacts?: { results: { id: string }[] };
      companies?: { results: { id: string }[] };
    };
  }>("/crm/v3/objects/deals", {
    properties: [...PROPS_DEAL],
    associations: ["contacts", "companies"],
  });

  return records.map((r) => {
    const p = r.properties;
    return {
      hubspot_deal_id: r.id,
      amount: Number(p.amount ?? 0),
      amount_in_home_currency: p.amount_in_home_currency
        ? Number(p.amount_in_home_currency)
        : null,
      dealstage: p.dealstage,
      pipeline: p.pipeline,
      hubspot_contact_id: r.associations?.contacts?.results?.[0]?.id ?? null,
      hubspot_company_id: r.associations?.companies?.results?.[0]?.id ?? null,
      createdate: p.createdate,
      closedate: p.closedate,
    };
  });
}

export type HsCompany = {
  hubspot_company_id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  country: string | null;
  hubspot_owner_id: string | null;
  is_target_abm: boolean;
};

export async function fetchCompanies(): Promise<HsCompany[]> {
  const records = await pageAll<HsRecord>("/crm/v3/objects/companies", {
    properties: [...PROPS_COMPANY],
  });
  return records.map((r) => {
    const p = r.properties;
    return {
      hubspot_company_id: r.id,
      name: p.name ?? "—",
      domain: p.domain,
      industry: p.industry,
      country: p.country,
      hubspot_owner_id: p.hubspot_owner_id,
      is_target_abm: p.is_target_abm === "true",
    };
  });
}

// Engagements (timeline) — V3 API.
export type HsEngagement = {
  hubspot_engagement_id: string;
  kind: "meeting" | "note" | "email" | "call";
  occurred_at: string;
  hubspot_contact_id: string | null;
  hubspot_company_id: string | null;
  body: string | null;
};

const ENGAGEMENT_PATHS: { path: string; kind: HsEngagement["kind"]; bodyProp: string }[] = [
  { path: "/crm/v3/objects/meetings", kind: "meeting", bodyProp: "hs_meeting_title" },
  { path: "/crm/v3/objects/notes", kind: "note", bodyProp: "hs_note_body" },
  { path: "/crm/v3/objects/emails", kind: "email", bodyProp: "hs_email_subject" },
  { path: "/crm/v3/objects/calls", kind: "call", bodyProp: "hs_call_title" },
];

export async function fetchEngagements(): Promise<HsEngagement[]> {
  const all: HsEngagement[] = [];
  for (const { path, kind, bodyProp } of ENGAGEMENT_PATHS) {
    const records = await pageAll<HsRecord & {
      associations?: {
        contacts?: { results: { id: string }[] };
        companies?: { results: { id: string }[] };
      };
    }>(path, {
      properties: [bodyProp, "hs_timestamp"],
      associations: ["contacts", "companies"],
    });
    for (const r of records) {
      all.push({
        hubspot_engagement_id: r.id,
        kind,
        occurred_at: r.properties.hs_timestamp ?? r.properties.createdate ?? new Date().toISOString(),
        hubspot_contact_id: r.associations?.contacts?.results?.[0]?.id ?? null,
        hubspot_company_id: r.associations?.companies?.results?.[0]?.id ?? null,
        body: r.properties[bodyProp] ?? null,
      });
    }
  }
  return all;
}
