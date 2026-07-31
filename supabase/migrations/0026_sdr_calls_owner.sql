-- 0026 — Calls por SDR: owner en actividades + tabla de owners.
--
-- Métrica "SDRs Overview" (llamadas por comercial × mes vs pipeline abierto/mes).
-- Necesitamos atribuir cada llamada a su propietario (SDR) y poder resolver el
-- id de owner a un nombre legible. Antes:
--   - `activities` guardaba las llamadas pero SIN owner (solo título+timestamp).
--   - No existía ninguna tabla/resolución de owners (el id se mostraba crudo).
--
-- La agregación (llamadas por owner×mes) se hace en TS en la fachada
-- `lib/data/sdr-calls.ts` — igual que `pipeline-totals.ts` —, así que aquí no
-- añadimos vistas materializadas ni tocamos `refresh_kpi_views()`.

-- Propietario de la actividad (llamada). Null = llamadas del dialer/integración
-- sin owner (no atribuibles a ningún SDR).
alter table activities add column if not exists owner_id text;
create index if not exists idx_activities_owner on activities (owner_id);

-- Owners de HubSpot (/crm/v3/owners). `archived=true` ≈ persona que dejó el
-- equipo ("Left"); false = activa. Se refresca en cada sync CRM.
create table if not exists owners (
  id          text primary key,
  first_name  text,
  last_name   text,
  email       text,
  archived    boolean not null default false,
  synced_at   timestamptz not null default now()
);
