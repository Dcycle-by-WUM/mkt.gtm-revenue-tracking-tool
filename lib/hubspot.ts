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
  "hubspot_owner_id", "lifecyclestage", "hs_lead_status", "lead_source",
  "hs_analytics_source", "utm_campaign", "country",
  "num_conversion_events", "recent_conversion_date",
  "recent_conversion_event_name", "first_conversion_event_name",
  "hs_email_last_open_date", "hs_email_open", "hs_email_click",
  "hs_email_replied", "hs_analytics_num_page_views",
  "hs_email_optout", "num_contacted_notes", "createdate",
] as const;

const PROPS_DEAL = [
  "dealname", "amount", "amount_in_home_currency", "dealstage", "pipeline",
  "hs_analytics_source", "createdate", "closedate",
  "hs_is_closed_won", "hs_is_closed",
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
  lead_source: string | null;
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

// MQL = Lead Status ∉ {MK NOT QUALIFIED, vacío} — DECISIONES #1. Los vacíos
// (aún sin clasificar) NO cuentan como MQL; el código contaba los vacíos y
// contradecía la decisión cerrada (auditoría 09-jul: 8 de 1.066 inbound 2026).
function deriveMql(leadStatus: string | null): boolean {
  if (!leadStatus || !leadStatus.trim()) return false;
  return leadStatus.trim().toUpperCase() !== "MK NOT QUALIFIED";
}

type HsPage<T> = { results: T[]; paging?: { next?: { after: string } } };
type HsRecord = { id: string; properties: Record<string, string | null> };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Pausa entre páginas de la API de HubSpot. El rate limit típico es
// ~100-190 req/10s; ~8 req/s deja margen y evita la tormenta de 429 que
// hacía que sync-crm se quedara sin tiempo (cada 429 costaba ≥2s de espera).
const PAGE_DELAY_MS = 120;

async function hsRetry<T>(fn: () => Promise<Response>, label: string): Promise<T> {
  const MAX_RETRIES = 6;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fn();
    if (res.ok) return (await res.json()) as T;
    // 429 (rate limit) y 5xx transitorios son reintentables.
    const retriable = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
    if (retriable && attempt < MAX_RETRIES) {
      // HubSpot manda `Retry-After` (segundos) en los 429 — respétalo. Si no,
      // backoff exponencial con techo de 10s. Jitter para no sincronizar
      // reintentos entre peticiones concurrentes.
      const retryAfter = Number(res.headers.get("retry-after"));
      const base = retryAfter > 0 ? retryAfter * 1000 : Math.min(Math.pow(2, attempt) * 500, 10000);
      const wait = base + Math.floor(Math.random() * 250);
      console.warn(`[hubspot] ${label}: ${res.status}, retry ${attempt + 1}/${MAX_RETRIES} en ${(wait / 1000).toFixed(1)}s…`);
      await sleep(wait);
      continue;
    }
    throw new Error(`HubSpot ${label} → ${res.status}: ${await res.text()}`);
  }
  throw new Error(`HubSpot ${label}: max retries exceeded`);
}

async function hsFetch<T>(path: string, qs: Record<string, string | string[]>): Promise<T> {
  const token = requireToken();
  const url = new URL(`${HUBSPOT_BASE}${path}`);
  for (const [k, v] of Object.entries(qs)) {
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else url.searchParams.set(k, v);
  }
  return hsRetry<T>(
    () => fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    }),
    path,
  );
}

async function pageAll<T>(
  path: string,
  baseQs: Record<string, string | string[]>,
  label = path,
): Promise<T[]> {
  const all: T[] = [];
  let after: string | undefined;
  const MAX_PAGES = 200;
  for (let i = 0; i < MAX_PAGES; i++) {
    const qs = { ...baseQs, limit: "100", ...(after ? { after } : {}) };
    const page = (await hsFetch(path, qs)) as HsPage<T>;
    all.push(...page.results);
    after = page.paging?.next?.after;
    if (!after) break;
    if (i === MAX_PAGES - 1) {
      console.warn(`[hubspot] ${label}: alcanzado límite de ${MAX_PAGES * 100} registros — puede haber datos truncados`);
    }
    await sleep(PAGE_DELAY_MS);                 // pacing anti-429
  }
  return all;
}

// Configuración de la ventana de ingesta (PRD §6 / DECISIONES #8).
//   HUBSPOT_BACKFILL_FROM    — fecha mínima de createdate (ISO). Default: 2025-12-01.
//   HUBSPOT_CONTACT_LEAD_SOURCES — valores de `lead_source` a incluir,
//                              separados por coma. Default: "Inbound".
//                              Pon vacío ("") para incluir todos.
function backfillFrom(): string {
  return process.env.HUBSPOT_BACKFILL_FROM || "2025-12-01T00:00:00Z";
}
function contactLeadSources(): string[] {
  const raw = process.env.HUBSPOT_CONTACT_LEAD_SOURCES;
  if (raw === undefined) return ["Inbound"];
  if (raw.trim() === "") return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

// Pagina el endpoint `/search` de HubSpot (filtros + sort + cursor `after`).
async function searchAll<T>(
  objectType: "contacts" | "deals" | "companies",
  body: Record<string, unknown>,
): Promise<T[]> {
  const token = requireToken();
  const all: T[] = [];
  let after: string | undefined;
  // Hasta 10k resultados por query de search (límite HubSpot).
  for (let i = 0; i < 100; i++) {
    const payload = { ...body, limit: 100, ...(after ? { after } : {}) };
    const page = await hsRetry<HsPage<T>>(
      () => fetch(`${HUBSPOT_BASE}/crm/v3/objects/${objectType}/search`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      `search ${objectType}`,
    );
    all.push(...page.results);
    after = page.paging?.next?.after;
    if (!after) break;
    await sleep(PAGE_DELAY_MS);                 // pacing anti-429
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
    lead_source: p.lead_source,
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
  const cutoff = backfillFrom();
  const sources = contactLeadSources();

  // Filtro: createdate >= cutoff AND (lead_source IN sources si hay filtro).
  const filters: { propertyName: string; operator: string; value?: string; values?: string[] }[] = [
    { propertyName: "createdate", operator: "GTE", value: cutoff },
  ];
  if (sources.length > 0) {
    filters.push({
      propertyName: "lead_source",
      operator: sources.length === 1 ? "EQ" : "IN",
      ...(sources.length === 1 ? { value: sources[0] } : { values: sources }),
    });
  }

  const records = await searchAll<HsRecord>("contacts", {
    properties: [...PROPS_CONTACT],
    filterGroups: [{ filters }],
    sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
  });
  // Emails internos fuera: las pruebas de formularios/demos/E2E del equipo
  // (alba+*@dcycle.io, paula.cons+test*@dcycle.io…) entran en HubSpot como
  // lead_source=Inbound e inflan Leads/MQL (26 de 154 inbound en abr-2026).
  // La migración 0019 aplica el mismo filtro en las vistas para lo ya
  // sincronizado. batchReadContacts NO filtra: esos contactos solo aportan
  // atribución de campaña/país a deals, no cuentan como leads.
  return records.map(mapContact).filter((c) => !c.email || !/@dcycle\.io$/i.test(c.email));
}

// Batch-read por ID, sin filtro de fecha ni de lead_source — para no perder
// la atribución de canal/campaña de un deal cuyo contacto asociado (el
// champion, o el primer contacto en la asociación) es más antiguo que
// HUBSPOT_BACKFILL_FROM o no es Inbound. Se usa solo para completar la
// atribución del deal (lib/hubspot.ts:fetchDeals); `contacts.lead_source`
// deja constancia de que no es necesariamente Inbound para que el leg de
// Leads/MQL (kpi_by_campaign_month / kpi_organic_by_month) no los cuente.
async function batchReadContacts(ids: string[]): Promise<HsContact[]> {
  if (ids.length === 0) return [];
  const token = requireToken();
  const all: HsRecord[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const page = await hsRetry<{ results: HsRecord[] }>(
      () => fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts/batch/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ properties: [...PROPS_CONTACT], inputs: batch.map((id) => ({ id })) }),
      }),
      "batch/read contacts",
    );
    all.push(...page.results);
  }
  return all.map(mapContact);
}

export type HsDeal = {
  hubspot_deal_id: string;
  dealname: string | null;
  amount: number;
  amount_in_home_currency: number | null;
  dealstage: string | null;
  pipeline: string | null;
  analytics_source: string | null;
  hubspot_contact_id: string | null;
  hubspot_company_id: string | null;
  createdate: string | null;
  closedate: string | null;
  // Flags calculados por HubSpot. Los stages de este portal son IDs
  // numéricos por pipeline ('22516636' = Closed won del AE Pipeline…), así
  // que `dealstage = 'closedwon'` no sirve para detectar ganados.
  is_closed_won: boolean;
  is_closed: boolean;
  // Canal paid real entre TODOS los contactos asociados (no solo el
  // primero) — auditoría 20-jul, caso Stadler: `analytics_source` del
  // deal es el origen del contacto con la actividad más antigua (regla de
  // HubSpot), que puede tapar a un champion paid más reciente asociado al
  // mismo deal. Null si ningún contacto asociado es PAID_SOCIAL/PAID_SEARCH.
  paid_contact_channel: string | null;
  paid_contact_id: string | null;
};

// Pipelines a incluir. Vacío = todos (sin filtro).
// Configurar via HUBSPOT_DEAL_PIPELINES (IDs separados por coma).
function dealPipelines(): string[] {
  const raw = process.env.HUBSPOT_DEAL_PIPELINES;
  if (!raw || raw.trim() === "") return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

// Fetch asociaciones por batch (la Search API no las devuelve inline).
// Devuelve TODOS los ids asociados por deal, no solo el primero — un deal
// puede tener varios contactos (cuentas ABM/enterprise) y quedarse solo con
// `r.to[0]` es lo que tapaba al champion paid en el caso Stadler (auditoría
// 20-jul). Los llamantes deciden si necesitan uno (p. ej. compañía, 1:1) o
// todos (contactos, para `resolvePaidContactChannel`).
async function fetchDealAssociations(
  dealIds: string[],
  toType: "contacts" | "companies",
): Promise<Map<string, string[]>> {
  const token = requireToken();
  const result = new Map<string, string[]>();
  for (let i = 0; i < dealIds.length; i += 100) {
    const batch = dealIds.slice(i, i + 100);
    let json: { results: { from: { id: string }; to: { id: string }[] }[] };
    try {
      json = await hsRetry<typeof json>(
        () => fetch(`${HUBSPOT_BASE}/crm/v3/associations/deals/${toType}/batch/read`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ inputs: batch.map((id) => ({ id })) }),
        }),
        `associations deals→${toType}`,
      );
    } catch {
      continue;
    }
    for (const r of json.results ?? []) {
      const ids = (r.to ?? []).map((t) => t.id).filter(Boolean);
      if (ids.length > 0) result.set(r.from.id, ids);
    }
  }
  return result;
}

// Un contacto solo puede ser el ORIGEN de un deal si existía ANTES de que
// el deal se creara (regla de negocio Davide, 20-jul — es la lógica final
// del tool). Un contacto creado después del deal no lo generó; es un
// stakeholder añadido más tarde y no debe definir el canal. Compara
// timestamps ISO-8601 UTC (orden lexicográfico = orden temporal). Si falta
// cualquiera de las dos fechas, no se puede validar → no cuenta.
function contactPredatesDeal(contactCreatedAt: string | null, dealCreatedAt: string | null): boolean {
  if (!contactCreatedAt || !dealCreatedAt) return false;
  return contactCreatedAt < dealCreatedAt;
}

// Entre TODOS los contactos asociados a un deal, ¿hay alguno con canal
// paid real Y creado antes que el deal? HubSpot calcula `hs_analytics_source`
// del deal a partir del contacto con la actividad MÁS ANTIGUA — que en
// cuentas con varios contactos puede no ser el champion. Se prioriza el
// primer contacto paid que además predate el deal (ver `contactPredatesDeal`:
// p. ej. Stadler queda fuera porque su champion Paid Search se creó el día
// DESPUÉS de que sales creara el deal a mano).
function resolvePaidContactChannel(
  contactIds: string[],
  contactsById: Map<string, HsContact>,
  dealCreatedAt: string | null,
): { channel: "LinkedIn" | "Google"; contactId: string } | null {
  for (const id of contactIds) {
    const c = contactsById.get(id);
    if (!c) continue;
    if (!contactPredatesDeal(c.created_at_hs, dealCreatedAt)) continue;
    if (c.analytics_source === "PAID_SOCIAL") return { channel: "LinkedIn", contactId: id };
    if (c.analytics_source === "PAID_SEARCH") return { channel: "Google", contactId: id };
  }
  return null;
}

export async function fetchDeals(): Promise<HsDeal[]> {
  const cutoff = backfillFrom();
  const pipelines = dealPipelines();

  const filters: { propertyName: string; operator: string; value?: string; values?: string[] }[] = [
    { propertyName: "createdate", operator: "GTE", value: cutoff },
  ];
  if (pipelines.length > 0) {
    filters.push({
      propertyName: "pipeline",
      operator: pipelines.length === 1 ? "EQ" : "IN",
      ...(pipelines.length === 1 ? { value: pipelines[0] } : { values: pipelines }),
    });
  }

  const records = await searchAll<HsRecord>("deals", {
    properties: [...PROPS_DEAL],
    filterGroups: [{ filters }],
    sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
  });

  // Fetch asociaciones en batch. Compañía sigue siendo 1:1 (nos vale el
  // primer id); contactos ahora se piden TODOS para poder detectar un
  // champion paid oculto entre varios (ver `resolvePaidContactChannel`).
  const dealIds = records.map((r) => r.id);
  const [contactMap, companyMap] = await Promise.all([
    fetchDealAssociations(dealIds, "contacts"),
    fetchDealAssociations(dealIds, "companies"),
  ]);

  const allContactIds = [...new Set([...contactMap.values()].flat())];
  const contactsById = new Map(
    (await batchReadContacts(allContactIds)).map((c) => [c.hubspot_contact_id, c]),
  );

  return records.map((r) => {
    const p = r.properties;
    const contactIds = contactMap.get(r.id) ?? [];
    const paidContact = resolvePaidContactChannel(contactIds, contactsById, p.createdate);
    return {
      hubspot_deal_id: r.id,
      dealname: p.dealname,
      amount: Number(p.amount_in_home_currency ?? p.amount ?? 0),
      amount_in_home_currency: p.amount_in_home_currency
        ? Number(p.amount_in_home_currency)
        : null,
      dealstage: p.dealstage,
      pipeline: p.pipeline,
      analytics_source: p.hs_analytics_source,
      hubspot_contact_id: contactIds[0] ?? null,
      hubspot_company_id: companyMap.get(r.id)?.[0] ?? null,
      createdate: p.createdate,
      closedate: p.closedate,
      is_closed_won: p.hs_is_closed_won === "true",
      is_closed: p.hs_is_closed === "true",
      paid_contact_channel: paidContact?.channel ?? null,
      paid_contact_id: paidContact?.contactId ?? null,
    };
  });
}

// Contactos asociados a deals ya sincronizados (por `hubspot_contact_id`),
// traídos SIN el filtro de fecha/lead_source de `fetchContacts` — para no
// perder la atribución de canal/campaña de un deal cuyo contacto (el
// champion, o el primer contacto en la asociación) es una cuenta ya
// existente más antigua que HUBSPOT_BACKFILL_FROM. Idempotente: hace
// upsert sobre las mismas filas que `fetchContacts` si ya estaban.
export async function fetchDealLinkedContacts(deals: HsDeal[]): Promise<HsContact[]> {
  const ids = [...new Set(deals.map((d) => d.hubspot_contact_id).filter((id): id is string => !!id))];
  return batchReadContacts(ids);
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

function mapCompany(r: HsRecord): HsCompany {
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
}

async function batchReadCompanies(ids: string[]): Promise<HsCompany[]> {
  if (ids.length === 0) return [];
  const token = requireToken();
  const all: HsRecord[] = [];
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const page = await hsRetry<{ results: HsRecord[] }>(
      () => fetch(`${HUBSPOT_BASE}/crm/v3/objects/companies/batch/read`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ properties: [...PROPS_COMPANY], inputs: batch.map((id) => ({ id })) }),
      }),
      "batch/read companies",
    );
    all.push(...page.results);
    if (i + 100 < ids.length) await sleep(PAGE_DELAY_MS);
  }
  return all.map(mapCompany);
}

// Backfill masivo de compañías (todas las creadas desde el cutoff). NO se
// usa en el sync horario — traía ~10k compañías, disparaba el rate limit de
// HubSpot y agotaba el tiempo. Se conserva para un backfill puntual de ABM
// (on hold, DECISIONES #11) si algún día hace falta el universo completo.
export async function fetchCompanies(): Promise<HsCompany[]> {
  const cutoff = backfillFrom();
  const records = await searchAll<HsRecord>("companies", {
    properties: [...PROPS_COMPANY],
    filterGroups: [{ filters: [
      { propertyName: "createdate", operator: "GTE", value: cutoff },
    ] }],
    sorts: [{ propertyName: "createdate", direction: "ASCENDING" }],
  });
  return records.map(mapCompany);
}

// Solo las compañías ASOCIADAS a deals (batch-read por id). Es lo único que
// necesita la plataforma viva: el fallback de país del deal en
// `deal_attribution` (join `accounts` por `hubspot_company_id`). Ventaja
// extra sobre `fetchCompanies`: trae la compañía del deal aunque se creara
// ANTES del cutoff (el filtro por fecha del fetch masivo se la saltaba).
export async function fetchDealLinkedCompanies(deals: HsDeal[]): Promise<HsCompany[]> {
  const ids = [...new Set(deals.map((d) => d.hubspot_company_id).filter((id): id is string => !!id))];
  return batchReadCompanies(ids);
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
  const cutoffMs = new Date(backfillFrom()).getTime();
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
      const occurred = r.properties.hs_timestamp ?? r.properties.createdate;
      if (!occurred) continue;
      if (new Date(occurred).getTime() < cutoffMs) continue;
      all.push({
        hubspot_engagement_id: r.id,
        kind,
        occurred_at: occurred,
        hubspot_contact_id: r.associations?.contacts?.results?.[0]?.id ?? null,
        hubspot_company_id: r.associations?.companies?.results?.[0]?.id ?? null,
        body: r.properties[bodyProp] ?? null,
      });
    }
  }
  return all;
}
