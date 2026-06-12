-- F0/F1 — Modelo de datos del camino PAID (Brief §6).
-- Camino CRM (contacts/deals/accounts/activities) llega cuando se desbloquee
-- la API key de HubSpot (§12.1).

-- Dimensión de campañas (LinkedIn + Google).
create table if not exists campaigns (
  id                   uuid primary key default gen_random_uuid(),
  source               text not null check (source in ('LinkedIn', 'Google')),
  platform_campaign_id text not null,
  campaign_group_name  text,            -- solo LinkedIn; base del país (§7.3)
  campaign_name        text not null,
  campaign_name_norm   text not null,   -- clave canónica normalizada (§7.1)
  status               text,
  country_parsed       text,            -- en LinkedIn se deriva del GRUPO
  first_seen           date,
  last_seen            date,
  unique (source, platform_campaign_id)
);

-- Spend diario por campaña — upsert idempotente por (source, platform_campaign_id, date).
create table if not exists ad_spend_daily (
  source               text not null check (source in ('LinkedIn', 'Google')),
  platform_campaign_id text not null,
  date                 date not null,
  campaign_id          uuid references campaigns(id),
  campaign_group_name  text,
  spend                numeric(14,2) not null default 0,
  currency             text not null default 'EUR',
  impressions          bigint not null default 0,
  clicks               bigint not null default 0,
  synced_at            timestamptz not null default now(),
  primary key (source, platform_campaign_id, date)
);

-- Overrides manuales de matching UTM ↔ campaña (§7.2).
create table if not exists campaign_aliases (
  id          uuid primary key default gen_random_uuid(),
  norm_key    text not null unique,     -- utm_campaign_norm / campaign_name_norm
  campaign_id uuid not null references campaigns(id),
  author      text,
  created_at  timestamptz not null default now()
);

-- Excepciones de país por patrón (§7.3): MEX_, US [BOFU], [UK], -ESP, legacy…
create table if not exists country_overrides (
  id         uuid primary key default gen_random_uuid(),
  pattern    text not null unique,
  country    text not null,
  author     text,
  created_at timestamptz not null default now()
);

-- Trazabilidad de cada run de ingesta (frescura por fuente → Data Health §8.12).
create table if not exists sync_runs (
  id                uuid primary key default gen_random_uuid(),
  source            text not null,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  status            text not null default 'running',
  rows              integer,
  last_covered_date date
);

create index if not exists idx_ad_spend_daily_date on ad_spend_daily (date);
create index if not exists idx_campaigns_norm on campaigns (campaign_name_norm);
