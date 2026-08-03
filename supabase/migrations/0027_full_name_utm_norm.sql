-- Backfill de las claves normalizadas tras cambiar `normalizeUtm`
-- (lib/matching.ts) para que la clave canónica sea el NOMBRE COMPLETO.
--
-- Bug que corrige: la normalización truncaba el nombre en el primer '[' o
-- '|', de modo que dos campañas distintas que solo se diferencian en el
-- sufijo colapsaban a la MISMA clave. Ejemplo real (jul-2026, DACH):
--
--   "INT_DACH_Mensaje_Calendario ESG [TOFU] … | Mensaje DACH"  ─┐ misma
--   "INT_DACH_Mensaje_Calendario ESG [TOFU] … | Mensaje GER"   ─┘ clave
--        → ambas normalizaban a "int_dach_mensaje_calendario esg"
--
-- En kpi_by_campaign_month los leads se cuentan por
-- `contacts.utm_campaign_norm IN (claves de la campaña)` (migración 0008),
-- así que un mismo lead casaba con las DOS campañas: 25 leads / 15 MQL
-- idénticos en las dos filas y el Total inflado al doble.
--
-- La nueva `normalizeUtm` conserva el nombre entero y colapsa cualquier
-- puntuación (espacios, [ ] | – - & _ …) a un único '_', separando
-- …_mensaje_dach de …_mensaje_ger. Las columnas `_norm` ya guardadas están
-- en el formato viejo (truncado) y hay que recalcularlas aquí; si no, el
-- join deja de casar hasta el siguiente sync.
--
-- `utm_norm(text)` espeja EXACTAMENTE la función TS (lower → quitar acentos
-- ES → colapsar [^a-z0-9]+ a '_' → recortar '_' de los extremos), para que
-- los dos lados del join (campaign_name_norm ↔ utm_campaign_norm) sigan
-- produciendo la misma cadena.

create or replace function utm_norm(raw text)
returns text
language sql
immutable
as $$
  select btrim(
    regexp_replace(
      translate(lower(btrim(coalesce(raw, ''))), 'áéíóúüñ', 'aeiouun'),
      '[^a-z0-9]+', '_', 'g'
    ),
    '_'
  );
$$;

-- Campañas: recomputar desde el nombre original.
update campaigns
   set campaign_name_norm = utm_norm(campaign_name)
 where campaign_name_norm is distinct from utm_norm(campaign_name);

-- Contactos: recomputar desde el UTM crudo. Los que no traen UTM se quedan
-- en NULL (igual que mapContact en lib/hubspot.ts).
update contacts
   set utm_campaign_norm = utm_norm(utm_campaign_raw)
 where utm_campaign_raw is not null
   and utm_campaign_norm is distinct from utm_norm(utm_campaign_raw);

-- NOTA sobre overrides manuales: `campaign_aliases.norm_key` y
-- `utm_manual_tags.utm_norm` guardan la clave ya normalizada (no el UTM
-- crudo), así que no se pueden recalcular aquí sin el origen. Los alias
-- creados contra el formato viejo (truncado) pueden dejar de casar; si
-- alguno se creó para un UTM con '[' o '|', hay que volver a asignarlo
-- desde Data Health → "UTMs sin match". Los que no tenían esos caracteres
-- no cambian.

-- Refresco NO concurrente (la migración corre en transacción; CONCURRENTLY
-- no está permitido dentro de una). channel depende de campaign → ese orden.
refresh materialized view kpi_by_campaign_month;
refresh materialized view kpi_by_channel_month;
