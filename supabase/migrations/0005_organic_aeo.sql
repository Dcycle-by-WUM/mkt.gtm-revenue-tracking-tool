-- F5 — Orgánico (SEO) + AEO (PRD §11). Datos vienen de GSC/Bing WMT/GA4
-- (vía Supermetrics), del rank tracker que se elija (Moz/Ahrefs/Semrush),
-- y de la plataforma de AI-visibility (Profound/Peec/Otterly/Semrush AI).
--
-- F5 está marcada como "on hold" en `DECISIONES.md` para la elección de
-- herramientas, pero el modelo ya queda en su sitio para que la pantalla
-- enchufe en cuanto se decida la herramienta.

-- Tráfico orgánico (separado branded vs non-branded en runtime con `brand_keywords`).
create table if not exists organic_traffic (
  id              uuid primary key default gen_random_uuid(),
  source          text not null check (source in ('GSC', 'GA4', 'Bing')),
  date            date not null,
  query           text,
  page            text,
  country         text,
  impressions     bigint not null default 0,
  clicks          bigint not null default 0,
  position_avg    numeric(6, 2),
  is_branded      boolean,                          -- derivado contra `brand_keywords`
  synced_at       timestamptz not null default now(),
  unique (source, date, query, page)
);
create index if not exists idx_organic_traffic_date on organic_traffic (date);
create index if not exists idx_organic_traffic_branded on organic_traffic (is_branded);

-- Keywords de marca (negativos para non-branded). Editable desde Admin.
create table if not exists brand_keywords (
  id          uuid primary key default gen_random_uuid(),
  keyword     text not null unique,
  author      text not null default 'anonymous@dev',
  created_at  timestamptz not null default now()
);

-- Rankings (top 3 / posiciones por keyword estratégica). De GSC o rank tracker.
create table if not exists keyword_rankings (
  id          uuid primary key default gen_random_uuid(),
  keyword     text not null,
  country     text,
  date        date not null,
  position    integer not null,
  url         text,
  source      text not null default 'GSC',          -- GSC / Moz / Ahrefs / Semrush
  synced_at   timestamptz not null default now(),
  unique (keyword, country, date, source)
);
create index if not exists idx_keyword_rankings_top3 on keyword_rankings (date) where position <= 3;

-- Domain Authority (snapshot semanal/mensual).
create table if not exists domain_authority (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  da          integer not null,
  provider    text not null check (provider in ('Moz', 'Ahrefs', 'Semrush')),
  synced_at   timestamptz not null default now(),
  unique (date, provider)
);

-- AI Visibility / Share of Voice por prompt estratégico.
-- Plataforma a decidir (Profound/Peec/Otterly/Semrush AI).
create table if not exists ai_visibility (
  id              uuid primary key default gen_random_uuid(),
  date            date not null,
  prompt          text not null,
  appeared        boolean not null,                 -- ¿Dcycle apareció?
  rank_in_answer  integer,                          -- posición dentro de la respuesta
  competitors     jsonb not null default '[]'::jsonb, -- {name, appeared, rank}
  platform        text not null,
  synced_at       timestamptz not null default now(),
  unique (date, prompt, platform)
);
create index if not exists idx_ai_visibility_date on ai_visibility (date);
