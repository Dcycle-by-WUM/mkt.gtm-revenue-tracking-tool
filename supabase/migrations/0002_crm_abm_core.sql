-- F1 — Camino CRM + ABM (PRD §6, §7).
-- Activado cuando HubSpot esté desbloqueado. La capa de UI lee de las mismas
-- tablas independientemente de si la ingesta está viva (fallback a mock).

-- Contactos (HubSpot Contact).
create table if not exists contacts (
  id                            uuid primary key default gen_random_uuid(),
  hubspot_contact_id            text not null unique,
  email                         text,
  firstname                     text,
  lastname                      text,
  company                       text,
  jobtitle                      text,
  hubspot_owner_id              text,
  lifecyclestage                text,
  lead_status                   text,
  analytics_source              text,                 -- hs_analytics_source
  utm_campaign_raw              text,
  utm_campaign_norm             text,                 -- clave canónica normalizada
  country_raw                   text,
  country_parsed                text,
  is_mql                        boolean,              -- derivada de la regla §8.3
  -- campos del Heat Score (PRD §10)
  num_conversion_events         integer default 0,
  recent_conversion_date        timestamptz,
  recent_conversion_event_name  text,
  first_conversion_event_name   text,
  email_last_open_date          timestamptz,
  email_open                    integer default 0,
  email_click                   integer default 0,
  email_replied                 integer default 0,
  page_views                    integer default 0,
  email_optout                  boolean default false,
  num_contacted_notes           integer default 0,
  created_at_hs                 timestamptz,
  synced_at                     timestamptz not null default now()
);
create index if not exists idx_contacts_utm_norm on contacts (utm_campaign_norm);
create index if not exists idx_contacts_lifecyclestage on contacts (lifecyclestage);

-- Empresas / cuentas (HubSpot Company).
create table if not exists accounts (
  id                  uuid primary key default gen_random_uuid(),
  hubspot_company_id  text not null unique,
  name                text not null,
  domain              text,
  industry            text,
  country             text,
  hubspot_owner_id    text,
  is_target_abm       boolean default false,         -- propiedad custom en HS (PRD §15)
  synced_at           timestamptz not null default now()
);
create index if not exists idx_accounts_domain on accounts (domain);

-- Deals (HubSpot Deal). Relación con contacto/empresa por hubspot ids.
create table if not exists deals (
  id                       uuid primary key default gen_random_uuid(),
  hubspot_deal_id          text not null unique,
  amount                   numeric(14, 2) not null default 0,
  amount_in_home_currency  numeric(14, 2),
  dealstage                text,
  pipeline                 text,
  hubspot_contact_id       text,
  hubspot_company_id       text,
  createdate               timestamptz,
  closedate                timestamptz,
  synced_at                timestamptz not null default now()
);
create index if not exists idx_deals_contact on deals (hubspot_contact_id);
create index if not exists idx_deals_stage on deals (dealstage);

-- Engagements (meetings/notes/emails) — timeline ABM (PRD §6.1).
create table if not exists activities (
  id                       uuid primary key default gen_random_uuid(),
  hubspot_engagement_id    text not null unique,
  kind                     text not null,            -- meeting / note / email / call
  occurred_at              timestamptz not null,
  hubspot_contact_id       text,
  hubspot_company_id       text,
  body                     text,
  synced_at                timestamptz not null default now()
);
create index if not exists idx_activities_company on activities (hubspot_company_id);
create index if not exists idx_activities_occurred on activities (occurred_at);

-- Heat Score persistido — algoritmo §10. Recalculado por job.
create table if not exists heat_scores (
  id                  uuid primary key default gen_random_uuid(),
  hubspot_contact_id  text not null unique,
  score               integer not null check (score between 0 and 100),
  band                text not null,                 -- 🔥 / ⚡ / 🌱 / ❄️
  breakdown           jsonb not null default '[]'::jsonb,
  eligible            boolean not null default true,
  computed_at         timestamptz not null default now()
);

-- Engagement de empresa en LinkedIn Ads (Companies Engagement Report).
-- Alimenta el componente "LinkedIn empresa engaged" del Heat Score.
create table if not exists linkedin_company_engagement (
  id           uuid primary key default gen_random_uuid(),
  company_name text not null,
  domain       text,
  level        text not null check (level in ('Muy alto', 'Alto', 'Medio', 'Bajo')),
  period_start date not null,
  period_end   date not null,
  source       text not null default 'supermetrics', -- o 'csv_upload' si toca
  synced_at    timestamptz not null default now()
);
create index if not exists idx_linkedin_company_period on linkedin_company_engagement (period_end);
