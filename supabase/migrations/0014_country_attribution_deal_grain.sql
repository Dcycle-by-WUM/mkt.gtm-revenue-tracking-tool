-- Fix de país en el pipeline por deal (0013) + vista granular por deal.
--
-- Problema reportado (Davide, 09-jul): filtrar "Spain" en julio da pipeline
-- 0€ mientras que sin filtro hay ~140K. Causa: las filas que llevan el
-- pipeline por deal aterrizaban con país 'Sin país / Multi' (fallback por
-- canal, hardcodeado) o con el texto libre de `contacts.country_raw`
-- ("Spain", "España"…), que no casa con los códigos ("ES", "UK"…) que usan
-- las campañas — el desplegable de la UI mezcla ambos mundos y el filtro
-- nunca junta el pipeline con su país.
--
-- Reglas nuevas:
--   1. `pipeline_country_map`: el pipeline de HubSpot determina el país del
--      deal (regla de negocio: TODO lo de AE Pipeline es España). Editable;
--      seed con AE Pipeline → ES.
--   2. `normalize_country()`: pasa el país libre del contacto a los mismos
--      códigos que usa `campaigns.country_parsed` (Spain/España → ES, etc.).
--   3. Precedencia de país para el deal: mapa por pipeline > país del
--      contacto normalizado > 'Sin país / Multi'. Las filas matcheadas a
--      campaña conservan el país de la campaña (es el grano de la vista).
--
-- Además: vista `deal_attribution` (grano = deal) para poder ver qué deals
-- vienen de contactos creados en 2026 (esfuerzo reciente de marketing) vs
-- contactos históricos — con nombre de deal, campaña, canal, país y mes del
-- contacto. `deals.dealname` se añade aquí; se rellena en el próximo
-- sync-crm (lib/hubspot.ts ya lo pide).

alter table deals add column if not exists dealname text;

-- País canónico desde texto libre (formularios de HubSpot). Cubre los
-- mercados del PRD; lo que no reconoce sale tal cual (trim) para no
-- esconder valores nuevos, y vacío/null → null.
create or replace function normalize_country(raw text)
returns text language sql immutable as $$
  select case lower(trim(coalesce(raw, '')))
    when '' then null
    when 'es' then 'ES' when 'spain' then 'ES' when 'españa' then 'ES'
    when 'espana' then 'ES' when 'espagne' then 'ES'
    when 'uk' then 'UK' when 'gb' then 'UK' when 'united kingdom' then 'UK'
    when 'great britain' then 'UK' when 'reino unido' then 'UK' when 'england' then 'UK'
    when 'de' then 'DE' when 'germany' then 'DE' when 'alemania' then 'DE' when 'deutschland' then 'DE'
    when 'fr' then 'FR' when 'france' then 'FR' when 'francia' then 'FR'
    when 'it' then 'IT' when 'italy' then 'IT' when 'italia' then 'IT'
    when 'us' then 'US' when 'usa' then 'US' when 'united states' then 'US'
    when 'united states of america' then 'US' when 'estados unidos' then 'US'
    when 'eeuu' then 'US' when 'ee.uu.' then 'US'
    when 'mx' then 'MX' when 'mexico' then 'MX' when 'méxico' then 'MX'
    when 'pt' then 'PT' when 'portugal' then 'PT'
    when 'nl' then 'NL' when 'netherlands' then 'NL' when 'paises bajos' then 'NL'
    when 'países bajos' then 'NL'
    else trim(raw)
  end
$$;

-- Pipeline de HubSpot → país. La fila de International Pipeline queda con
-- country NULL a propósito: es multi-país, el país sale del contacto.
create table if not exists pipeline_country_map (
  pipeline_id text primary key,          -- id del pipeline en HubSpot
  label       text not null,             -- nombre legible (para la UI)
  country     text                       -- null = sin país fijo (multi)
);

insert into pipeline_country_map (pipeline_id, label, country) values
  ('7888791',   'AE Pipeline',            'ES'),
  ('727373069', 'International Pipeline', null)
on conflict (pipeline_id) do update set label = excluded.label, country = excluded.country;

drop materialized view if exists kpi_by_channel_month;
drop materialized view if exists kpi_by_campaign_month;
drop materialized view if exists kpi_organic_by_month;
drop view if exists deal_attribution;

-- Grano = deal. Fuente única de atribución por deal, compartida por las
-- vistas KPI (legs de SQL/pipeline) y por la pantalla de granularidad.
-- Excluye OFFLINE (fuera de alcance, decisión de negocio 0013).
create view deal_attribution as
select
  d.hubspot_deal_id,
  coalesce(d.dealname, d.hubspot_deal_id)          as dealname,
  to_char(d.createdate, 'YYYY-MM')                 as month,
  coalesce(d.amount_in_home_currency, d.amount)    as amount,
  d.dealstage,
  (d.dealstage = 'closedwon')                      as is_closed_won,
  d.pipeline                                       as pipeline_id,
  coalesce(pcm.label, d.pipeline, '—')             as pipeline_label,
  case
    when d.analytics_source = 'PAID_SOCIAL' then 'LinkedIn'
    when d.analytics_source = 'PAID_SEARCH' then 'Google'
    else 'Otros'
  end                                              as channel,
  cmp.campaign_name                                as campaign,
  cmp.id                                           as campaign_id,
  coalesce(
    pcm.country,
    cmp.country_parsed,
    ct.country_parsed,
    normalize_country(ct.country_raw),
    'Sin país / Multi'
  )                                                as country,
  ct.hubspot_contact_id,
  ct.created_at_hs                                 as contact_created_at,
  to_char(ct.created_at_hs, 'YYYY-MM')             as contact_created_month
from deals d
left join contacts ct on ct.hubspot_contact_id = d.hubspot_contact_id
left join pipeline_country_map pcm on pcm.pipeline_id = d.pipeline
left join lateral (
  select c.id, c.campaign_name, c.country_parsed
  from campaign_match_keys cmk
  join campaigns c on c.id = cmk.campaign_id
  where cmk.norm_key = ct.utm_campaign_norm
  limit 1
) cmp on true
where coalesce(d.analytics_source, '') != 'OFFLINE'
  and d.createdate is not null;

create materialized view kpi_by_campaign_month as
with spend_agg as (
  select
    c.id                                             as campaign_id,
    coalesce(c.source, s.source)                     as channel,
    coalesce(c.campaign_name, 'Sin campaña')         as campaign,
    coalesce(c.country_parsed, 'Sin país / Multi')   as country,
    to_char(s.date, 'YYYY-MM')                       as month,
    sum(s.spend)::numeric(14, 2)                     as spend,
    sum(s.impressions)::bigint                       as impressions,
    sum(s.clicks)::bigint                            as clicks
  from ad_spend_daily s
  left join campaigns c on s.campaign_id = c.id
  group by c.id, coalesce(c.source, s.source), coalesce(c.campaign_name, 'Sin campaña'),
    coalesce(c.country_parsed, 'Sin país / Multi'), to_char(s.date, 'YYYY-MM')
),
-- Leads/MQL — por contacto, mes del contacto (sin cambios respecto a 0013).
contact_campaign_month as (
  select
    ct.id                                 as contact_id,
    ct.is_mql,
    cmk.campaign_id,
    to_char(ct.created_at_hs, 'YYYY-MM')  as month
  from contacts ct
  join campaign_match_keys cmk on cmk.norm_key = ct.utm_campaign_norm
  where ct.created_at_hs is not null
    and coalesce(ct.lead_source, 'Inbound') = 'Inbound'
),
lead_agg as (
  select
    campaign_id, month,
    count(distinct contact_id)                            as leads,
    count(distinct contact_id) filter (where is_mql)      as mql
  from contact_campaign_month
  group by campaign_id, month
),
-- SQL/Pipeline/Closed Won — por deal, desde deal_attribution (que ya
-- resuelve campaña, canal y país con la precedencia nueva).
deal_agg as (
  select
    campaign_id, month,
    count(*) filter (where amount > 0)                                    as sql,
    coalesce(sum(amount), 0)::numeric(14, 2)                              as pipeline,
    coalesce(sum(amount) filter (where is_closed_won), 0)::numeric(14, 2) as closed_won
  from deal_attribution
  where campaign_id is not null
  group by campaign_id, month
),
-- Deals paid sin campaña matcheada → bucket "Sin campaña" del canal, con
-- el país que resuelve deal_attribution (mapa por pipeline > contacto).
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
campaign_month_keys as (
  select campaign_id, month from spend_agg where campaign_id is not null
  union
  select campaign_id, month from lead_agg
  union
  select campaign_id, month from deal_agg
),
sin_campana_spend as (
  select channel, country, month,
    sum(spend)::numeric(14, 2) as spend,
    sum(impressions)::bigint   as impressions,
    sum(clicks)::bigint        as clicks
  from spend_agg
  where campaign_id is null
  group by channel, country, month
),
sin_campana_keys as (
  select channel, country, month from sin_campana_spend
  union
  select channel, country, month from deal_channel_fallback
)
select
  c.source                                       as channel,
  c.campaign_name                                 as campaign,
  coalesce(c.country_parsed, 'Sin país / Multi')  as country,
  k.month,
  coalesce(sa.spend, 0)                           as spend,
  coalesce(sa.impressions, 0)                     as impressions,
  coalesce(sa.clicks, 0)                          as clicks,
  coalesce(la.leads, 0)                           as leads,
  coalesce(la.mql, 0)                             as mql,
  coalesce(da.sql, 0)                             as sql,
  coalesce(da.pipeline, 0)                        as pipeline,
  coalesce(da.closed_won, 0)                      as closed_won
from campaign_month_keys k
join campaigns c on c.id = k.campaign_id
left join spend_agg sa on sa.campaign_id = k.campaign_id and sa.month = k.month
left join lead_agg la on la.campaign_id = k.campaign_id and la.month = k.month
left join deal_agg da on da.campaign_id = k.campaign_id and da.month = k.month
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

-- Orgánico: leads por contacto (país normalizado, no texto libre) + deals
-- no-paid sin campaña desde deal_attribution (país ya resuelto allí).
create materialized view kpi_organic_by_month as
with organic_contacts as (
  select
    ct.id,
    ct.is_mql,
    coalesce(ct.country_parsed, normalize_country(ct.country_raw), 'Sin país / Multi') as country,
    to_char(ct.created_at_hs, 'YYYY-MM') as month
  from contacts ct
  where coalesce(ct.analytics_source, '') not in ('PAID_SOCIAL', 'PAID_SEARCH')
    and ct.created_at_hs is not null
    and coalesce(ct.lead_source, 'Inbound') = 'Inbound'
    and not exists (
      select 1 from campaign_match_keys cmk where cmk.norm_key = ct.utm_campaign_norm
    )
),
lead_agg as (
  select country, month,
    count(distinct id)                        as leads,
    count(distinct id) filter (where is_mql)  as mql
  from organic_contacts
  group by country, month
),
deal_agg as (
  select country, month,
    count(*) filter (where amount > 0)                                    as sql,
    coalesce(sum(amount), 0)::numeric(14, 2)                              as pipeline,
    coalesce(sum(amount) filter (where is_closed_won), 0)::numeric(14, 2) as closed_won
  from deal_attribution
  where campaign_id is null and channel = 'Otros'
  group by country, month
),
keys as (
  select country, month from lead_agg
  union
  select country, month from deal_agg
)
select
  k.country,
  k.month,
  0::numeric(14, 2)                              as spend,
  0::bigint                                       as impressions,
  0::bigint                                       as clicks,
  coalesce(la.leads, 0)                           as leads,
  coalesce(la.mql, 0)                             as mql,
  coalesce(da.sql, 0)                             as sql,
  coalesce(da.pipeline, 0)                        as pipeline,
  coalesce(da.closed_won, 0)                      as closed_won
from keys k
left join lead_agg la on la.country = k.country and la.month = k.month
left join deal_agg da on da.country = k.country and da.month = k.month;

create unique index idx_kpi_organic_month_unique
  on kpi_organic_by_month (country, month);

-- refresh_kpi_views() (0009) sigue apuntando a los 3 nombres por texto.
