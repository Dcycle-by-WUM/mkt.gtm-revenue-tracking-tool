-- F1/F2/F3 — Datos que la app genera ella misma (no vienen de ninguna fuente
-- externa): forecast manual, notas, tags manuales de UTM, etiquetas de campaña,
-- usuarios/roles internos. PRD §3 (roles), §7 (modelo), §8.5 (forecast).
--
-- Mientras el SSO no esté listo, `author` se rellena con un placeholder
-- ("anonymous@dev") y se sustituye por `auth.uid()` de Supabase cuando entre.

-- Tag manual de UTM ↔ campaña — paso 3 del matching en cascada (§8.1).
create table if not exists utm_manual_tags (
  id           uuid primary key default gen_random_uuid(),
  utm_norm     text not null unique,
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  author       text not null default 'anonymous@dev',
  created_at   timestamptz not null default now()
);

-- Etiquetas libres por campaña (p.ej. "Webinar", "MOFU") para hacer rollups
-- en Campaign Detail.
create table if not exists campaign_tags (
  campaign_id  uuid not null references campaigns(id) on delete cascade,
  tag          text not null,
  author       text not null default 'anonymous@dev',
  created_at   timestamptz not null default now(),
  primary key (campaign_id, tag)
);
create index if not exists idx_campaign_tags_tag on campaign_tags (tag);

-- Objetivos / forecast — editable por canal+mes+país (PRD §8.5).
-- "Real" no se guarda aquí: se calcula en runtime sobre `ad_spend_daily` + deals.
create table if not exists targets (
  id               uuid primary key default gen_random_uuid(),
  channel          text not null check (channel in ('LinkedIn', 'Google')),
  month            text not null,                    -- YYYY-MM
  country          text not null,
  target_spend     numeric(14, 2) not null default 0,
  target_pipeline  numeric(14, 2) not null default 0,
  author           text not null default 'anonymous@dev',
  updated_at       timestamptz not null default now(),
  unique (channel, month, country)
);

-- Notas libres por entidad: campaña, cuenta, deal, contacto. Persistidas
-- con autor para auditoría (reemplaza el localStorage del prototipo).
create table if not exists notes (
  id          uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('campaign', 'account', 'contact', 'deal')),
  target_key  text not null,                         -- nombre de campaña / domain / hubspot id
  body        text not null,
  author      text not null default 'anonymous@dev',
  updated_at  timestamptz not null default now(),
  unique (target_kind, target_key, author)
);

-- Roles internos. Se enchufa al SSO cuando entre (auth.users → app_users).
create table if not exists app_users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  display_name text,
  role        text not null check (role in ('admin', 'marketing', 'sdr', 'readonly')),
  created_at  timestamptz not null default now()
);

-- Configuración editable de pesos del Heat Score (PRD §10 final).
-- Versión activa = la de `is_active=true`. Permite ajustar sin redeploy.
create table if not exists heat_weights (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                         -- p.ej. "default-2026Q3"
  weights     jsonb not null,                        -- estructura libre por señal
  thresholds  jsonb not null,                        -- 🔥/⚡/🌱/❄️
  is_active   boolean not null default false,
  author      text not null default 'anonymous@dev',
  created_at  timestamptz not null default now()
);

-- Asegura una sola fila activa.
create unique index if not exists idx_heat_weights_active on heat_weights (is_active) where is_active;
