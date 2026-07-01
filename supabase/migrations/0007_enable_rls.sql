-- Fix: Row-Level Security estaba deshabilitada en todas las tablas de
-- `public`, dejándolas públicamente accesibles (lectura/escritura/borrado)
-- para cualquiera que tuviera la `anon key` — que es pública, va embebida en
-- el bundle del cliente (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, ver
-- `lib/supabase/client.ts`). Alertado por Supabase como
-- `rls_disabled_in_public` (crítico).
--
-- La app ya está diseñada para esto: las lecturas van por `getSupabase()`
-- (anon key) y las escrituras SIEMPRE por `getSupabaseAdmin()` (service role,
-- server-side, bypassa RLS — ver `lib/supabase/admin.ts`). Como el SSO
-- (`GOOGLE_OAUTH_CLIENT_ID`) todavía no está conectado (docs/CONEXIONES.md
-- §5), no hay `auth.uid()` con el que filtrar filas por usuario todavía, así
-- que la policy de lectura es abierta (`using (true)`) para no romper la app.
-- Cuando el SSO entre, esto se puede endurecer para exigir
-- `auth.role() = 'authenticated'` (quitando `anon`) o filtrar por
-- `app_users`.
--
-- Sin policies de insert/update/delete: anon/authenticated quedan sin
-- permiso de escritura (deniega por defecto con RLS activo), que es
-- exactamente el patrón que ya usa el código — todas las escrituras pasan
-- por el service role.

do $$
declare
  t text;
begin
  foreach t in array array[
    'campaigns', 'ad_spend_daily', 'campaign_aliases', 'country_overrides', 'sync_runs',
    'contacts', 'accounts', 'deals', 'activities', 'heat_scores', 'linkedin_company_engagement',
    'utm_manual_tags', 'campaign_tags', 'targets', 'notes', 'app_users', 'heat_weights',
    'organic_traffic', 'brand_keywords', 'keyword_rankings', 'domain_authority', 'ai_visibility'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_select', t);
    execute format(
      'create policy %I on %I for select to anon, authenticated using (true)',
      t || '_select', t
    );
  end loop;
end $$;
