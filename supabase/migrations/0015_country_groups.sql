-- Grupos de países / regiones (petición Davide, 09-jul): poder filtrar y
-- agregar por región de negocio — Spain, DACH, Rest of International — en
-- vez de por la lista completa de países, que se hace inmanejable en cuanto
-- entran leads orgánicos de cualquier parte. Editable desde Admin (el
-- usuario define sus propios grupos); esta seed refleja las regiones
-- actuales del equipo.
--
-- Un país sin fila aquí cae en 'Rest of International' (default de la app,
-- lib/data/regions.ts). 'Sin país / Multi' se muestra como su propio grupo.

create table if not exists country_groups (
  country    text primary key,            -- código canónico (ES, DE, UK…)
  group_name text not null,
  updated_at timestamptz not null default now()
);

insert into country_groups (country, group_name) values
  ('ES', 'Spain'),
  ('DE', 'DACH'),
  ('AT', 'DACH'),
  ('CH', 'DACH'),
  ('UK', 'Rest of International'),
  ('FR', 'Rest of International'),
  ('IT', 'Rest of International'),
  ('US', 'Rest of International'),
  ('MX', 'Rest of International'),
  ('PT', 'Rest of International'),
  ('NL', 'Rest of International')
on conflict (country) do nothing;

-- Mismo patrón RLS que el resto (0007): lectura abierta con anon, escritura
-- solo por service role.
alter table country_groups enable row level security;
drop policy if exists "read country_groups" on country_groups;
create policy "read country_groups" on country_groups
  for select to anon, authenticated using (true);
