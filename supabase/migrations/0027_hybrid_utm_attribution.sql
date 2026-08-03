-- Atribución HÍBRIDA de leads ↔ campaña — corrige el doble conteo.
--
-- PROBLEMA (validado con datos reales, jul-2026):
-- La clave de match es el PREFIJO del nombre (lo de antes del primer '['/'|'),
-- porque el `utm_campaign` que HubSpot guarda en el lead solo trae ese prefijo
-- (no el sufijo de funnel/variante). Eso es necesario —sin truncar, ~355 leads
-- dejan de casar— PERO cuando varias campañas comparten prefijo, la vista
-- contaba cada lead una vez por CADA campaña del grupo (join a
-- campaign_match_keys en 0024 → varias filas por contacto). Resultado: 2 filas
-- DACH/GER con los mismos 25 leads, grupos SCOPE3 con 12 leads × 5 filas, etc.
--
-- SOLUCIÓN: cada lead se atribuye a UNA sola "unidad de atribución" (attr_id):
--   · Grupo SEPARABLE (todos sus leads traen el sufijo completo en el UTM,
--     p.ej. DACH): se atribuye a la campaña concreta que casa a nivel fino
--     → filas separadas, 24 DACH / 3 GER.
--   · Grupo NO separable (los leads solo traen el prefijo, la mayoría): se
--     colapsa a un ANCLA de grupo (la campaña de mayor spend) → UNA fila, con
--     el spend del grupo sumado y los leads contados una vez.
-- Nunca duplica y nunca pierde leads (los que hoy casan por prefijo siguen
-- casando: en el peor caso caen al ancla del grupo).
--
-- No toca datos guardados (campaign_name_norm / utm_campaign_norm siguen siendo
-- el prefijo): la clave "fina" se calcula en la vista desde el nombre crudo.
-- Solo-vista: aplicar en el SQL editor de prod; efecto tras refresh_kpi_views().

-- Clave "fina" = nombre COMPLETO normalizado (colapsa toda puntuación a '_').
-- Espeja la parte "sin truncar" que se descartó en la opción 1.
create or replace function utm_norm_full(raw text)
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

-- Mapa de atribución: campaign_id → (attr_id, is_split).
--   is_split = el grupo (mismo campaign_name_norm) es separable a nivel fino:
--   TODO lead casado del grupo tiene una clave fina que coincide con la de
--   alguna campaña del grupo (no hay leads "solo-prefijo"). En ese caso cada
--   campaña es su propia unidad; si no, todas apuntan al ancla del grupo.
create or replace view campaign_attribution as
with camp as (
  select
    c.id,
    c.campaign_name_norm                as prefix_key,
    utm_norm_full(c.campaign_name)      as fine_key
  from campaigns c
),
-- Leads casados (mismos filtros que la vista de KPIs) con su prefijo + fino.
lead_keys as (
  select
    ct.utm_campaign_norm                    as prefix_key,
    utm_norm_full(ct.utm_campaign_raw)      as fine_key
  from contacts ct
  where ct.created_at_hs is not null
    and coalesce(ct.lead_source, 'Inbound') = 'Inbound'
    and coalesce(ct.email, '') not ilike '%@dcycle.io'
    and ct.utm_campaign_norm is not null
    and ct.utm_campaign_raw is not null
),
group_fine as (
  select prefix_key, array_agg(distinct fine_key) as fine_keys
  from camp group by prefix_key
),
-- Grupos con AL MENOS un lead que no casa a nivel fino → no separables.
bad as (
  select distinct lk.prefix_key
  from lead_keys lk
  join group_fine gf on gf.prefix_key = lk.prefix_key
  where not (lk.fine_key = any(gf.fine_keys))
),
spend_by_campaign as (
  select campaign_id, sum(spend) as spend
  from ad_spend_daily group by campaign_id
),
-- Ancla del grupo = campaña de mayor spend (desempate por id).
anchor as (
  select
    c.prefix_key,
    (array_agg(c.id order by coalesce(sp.spend, 0) desc, c.id))[1] as anchor_id
  from camp c
  left join spend_by_campaign sp on sp.campaign_id = c.id
  group by c.prefix_key
)
select
  c.id                                                    as campaign_id,
  (bad.prefix_key is null)                                as is_split,
  case when bad.prefix_key is null then c.id else a.anchor_id end as attr_id
from camp c
join anchor a on a.prefix_key = c.prefix_key
left join bad on bad.prefix_key = c.prefix_key;

drop materialized view if exists kpi_by_channel_month;
drop materialized view if exists kpi_by_campaign_month;

create materialized view kpi_by_campaign_month as
with
-- Metadatos de cada unidad de atribución (una fila por attr_id).
-- Etiqueta: nombre completo si es separable; el PREFIJO común si es un grupo
-- colapsado (para que la fila lea como "el grupo", no como una variante suelta).
attr_meta as (
  select
    a.attr_id,
    a.is_split,
    c.source                                        as channel,
    coalesce(c.country_parsed, 'Sin país / Multi')  as country,
    case
      when a.is_split then c.campaign_name
      else btrim(regexp_replace(c.campaign_name, '\s*(\[|\|).*$', ''))
    end                                             as campaign
  from (select distinct attr_id, is_split from campaign_attribution) a
  join campaigns c on c.id = a.attr_id
),
-- Spend casado, agregado por unidad de atribución (suma las campañas del grupo
-- colapsado; deja cada campaña sola si el grupo es separable).
spend_agg as (
  select
    ca.attr_id,
    to_char(s.date, 'YYYY-MM')      as month,
    sum(s.spend)::numeric(14, 2)    as spend,
    sum(s.impressions)::bigint      as impressions,
    sum(s.clicks)::bigint           as clicks
  from ad_spend_daily s
  join campaign_attribution ca on ca.campaign_id = s.campaign_id
  group by ca.attr_id, to_char(s.date, 'YYYY-MM')
),
-- Cada contacto → EXACTAMENTE una unidad de atribución.
--   · grupo separable: la campaña que casa a nivel fino.
--   · grupo no separable: todas las campañas del grupo mapean al mismo ancla,
--     así que el DISTINCT colapsa a una sola fila por contacto.
contact_attr as (
  select distinct
    ct.id                                 as contact_id,
    ct.is_mql,
    to_char(ct.created_at_hs, 'YYYY-MM')  as month,
    ca.attr_id
  from contacts ct
  join campaigns c on c.campaign_name_norm = ct.utm_campaign_norm
  join campaign_attribution ca on ca.campaign_id = c.id
  where ct.created_at_hs is not null
    and coalesce(ct.lead_source, 'Inbound') = 'Inbound'
    and coalesce(ct.email, '') not ilike '%@dcycle.io'
    and (
      (not ca.is_split)
      or utm_norm_full(c.campaign_name) = utm_norm_full(ct.utm_campaign_raw)
    )
),
lead_agg as (
  select
    attr_id, month,
    count(distinct contact_id)                        as leads,
    count(distinct contact_id) filter (where is_mql)  as mql
  from contact_attr
  group by attr_id, month
),
-- Deals: se remapea la campaña que resolvió deal_attribution a su unidad.
deal_agg as (
  select
    ca.attr_id, da.month,
    count(*) filter (where da.amount > 0)                                    as sql,
    coalesce(sum(da.amount), 0)::numeric(14, 2)                              as pipeline,
    coalesce(sum(da.amount) filter (where da.is_closed_won), 0)::numeric(14, 2) as closed_won
  from deal_attribution da
  join campaign_attribution ca on ca.campaign_id = da.campaign_id
  where da.campaign_id is not null
  group by ca.attr_id, da.month
),
-- Deals sin campaña (canal paid pero UTM no casó) — igual que 0024.
deal_channel_fallback as (
  select
    channel, country, month,
    count(*) filter (where amount > 0)                                    as sql,
    coalesce(sum(amount), 0)::numeric(14, 2)                              as pipeline,
    coalesce(sum(amount) filter (where is_closed_won), 0)::numeric(14, 2) as closed_won
  from deal_attribution
  where campaign_id is null and channel in ('LinkedIn', 'Google')
  group by channel, country, month
),
attr_month_keys as (
  select attr_id, month from spend_agg
  union
  select attr_id, month from lead_agg
  union
  select attr_id, month from deal_agg
),
-- Spend sin campaña (campaign_id null en ad_spend) — igual que 0024.
sin_campana_spend as (
  select
    coalesce(s.source, 'Otros')                     as channel,
    'Sin país / Multi'                              as country,
    to_char(s.date, 'YYYY-MM')                      as month,
    sum(s.spend)::numeric(14, 2)                    as spend,
    sum(s.impressions)::bigint                      as impressions,
    sum(s.clicks)::bigint                           as clicks
  from ad_spend_daily s
  where s.campaign_id is null
  group by coalesce(s.source, 'Otros'), to_char(s.date, 'YYYY-MM')
),
sin_campana_keys as (
  select channel, country, month from sin_campana_spend
  union
  select channel, country, month from deal_channel_fallback
)
select
  am.channel,
  am.campaign,
  am.country,
  k.month,
  coalesce(sa.spend, 0)                           as spend,
  coalesce(sa.impressions, 0)                     as impressions,
  coalesce(sa.clicks, 0)                          as clicks,
  coalesce(la.leads, 0)                           as leads,
  coalesce(la.mql, 0)                             as mql,
  coalesce(da.sql, 0)                             as sql,
  coalesce(da.pipeline, 0)                        as pipeline,
  coalesce(da.closed_won, 0)                      as closed_won
from attr_month_keys k
join attr_meta am on am.attr_id = k.attr_id
left join spend_agg sa on sa.attr_id = k.attr_id and sa.month = k.month
left join lead_agg  la on la.attr_id = k.attr_id and la.month = k.month
left join deal_agg  da on da.attr_id = k.attr_id and da.month = k.month
union all
select
  sck.channel,
  'Sin campaña'                                   as campaign,
  sck.country,
  sck.month,
  coalesce(scs.spend, 0)                          as spend,
  coalesce(scs.impressions, 0)                    as impressions,
  coalesce(scs.clicks, 0)                         as clicks,
  0::bigint                                       as leads,
  0::bigint                                       as mql,
  coalesce(dcf.sql, 0)                            as sql,
  coalesce(dcf.pipeline, 0)                       as pipeline,
  coalesce(dcf.closed_won, 0)                     as closed_won
from sin_campana_keys sck
left join sin_campana_spend scs
  on scs.channel = sck.channel and scs.country = sck.country and scs.month = sck.month
left join deal_channel_fallback dcf
  on dcf.channel = sck.channel and dcf.country = sck.country and dcf.month = sck.month;

create unique index idx_kpi_campaign_month_unique
  on kpi_by_campaign_month (channel, campaign, country, month);

create index idx_kpi_campaign_month_keys
  on kpi_by_campaign_month (channel, month, country);

create materialized view kpi_by_channel_month as
select
  channel, country, month,
  sum(spend)::numeric(14, 2)         as spend,
  sum(impressions)::bigint           as impressions,
  sum(clicks)::bigint                as clicks,
  sum(leads)::bigint                 as leads,
  sum(mql)::bigint                   as mql,
  sum(sql)::bigint                   as sql,
  sum(pipeline)::numeric(14, 2)      as pipeline,
  sum(closed_won)::numeric(14, 2)    as closed_won
from kpi_by_campaign_month
group by channel, country, month;

create unique index idx_kpi_channel_month_unique
  on kpi_by_channel_month (channel, country, month);

-- kpi_organic_by_month (0024) no cambia: no depende del grano de campaña.
-- refresh_kpi_views() (0009) sigue apuntando a los 3 nombres por texto.
refresh materialized view kpi_by_campaign_month;
refresh materialized view kpi_by_channel_month;
