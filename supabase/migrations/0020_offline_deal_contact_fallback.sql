-- Fallback de inbound por CONTACTO para deals con fuente OFFLINE (decisión
-- Davide, 10-jul — auditoría §3.6).
--
-- Problema: cuando sales crea el deal a mano (CRM_UI), lo importa (IMPORT)
-- o entra por integración, HubSpot pone el Original Traffic Source del deal
-- a OFFLINE aunque el contacto que lo originó sea inbound de verdad
-- (SOCOTEC: contacto Paid Social/LinkedIn y MQL → deal OFFLINE). La regla
-- estricta de 0013 (deals OFFLINE fuera) dejaba 194.145 € / 10 deals de
-- pipeline inbound sin atribuir a marketing en 2026.
--
-- Regla nueva: un deal con fuente OFFLINE (o vacía) CUENTA como inbound si
-- su contacto asociado tiene lead_source = 'Inbound' explícito (no vale el
-- default-NULL: el 97% de los contactos del portal no tienen lead_source) y
-- no es un email interno @dcycle.io. El canal sale del contacto
-- (PAID_SOCIAL → LinkedIn, PAID_SEARCH → Google, resto → Otros). El MES
-- sigue siendo el del deal (grano por deal, decisión 0013, sin cambios).
--
-- La vista expone `attribution_via` ('deal' | 'contacto') para poder
-- distinguir en /deals qué deals entran por el fallback.

drop materialized view if exists kpi_by_channel_month;
drop materialized view if exists kpi_by_campaign_month;
drop materialized view if exists kpi_organic_by_month;
drop view if exists deal_attribution;

create view deal_attribution as
select
  d.hubspot_deal_id,
  coalesce(d.dealname, d.hubspot_deal_id)          as dealname,
  to_char(d.createdate, 'YYYY-MM')                 as month,
  coalesce(d.amount_in_home_currency, d.amount)    as amount,
  d.dealstage,
  coalesce(d.is_closed_won, d.dealstage = 'closedwon', false) as is_closed_won,
  coalesce(d.is_closed, false)                     as is_closed,
  d.pipeline                                       as pipeline_id,
  pcm.label                                        as pipeline_label,
  pcm.region                                       as business_region,
  case
    when d.analytics_source = 'PAID_SOCIAL' then 'LinkedIn'
    when d.analytics_source = 'PAID_SEARCH' then 'Google'
    when coalesce(d.analytics_source, '') in ('', 'OFFLINE')
      and ct.analytics_source = 'PAID_SOCIAL' then 'LinkedIn'
    when coalesce(d.analytics_source, '') in ('', 'OFFLINE')
      and ct.analytics_source = 'PAID_SEARCH' then 'Google'
    else 'Otros'
  end                                              as channel,
  case
    when coalesce(d.analytics_source, '') in ('', 'OFFLINE') then 'contacto'
    else 'deal'
  end                                              as attribution_via,
  cmp.campaign_name                                as campaign,
  cmp.id                                           as campaign_id,
  coalesce(
    pcm.country,
    cmp.country_parsed,
    ct.country_parsed,
    normalize_country(ct.country_raw),
    normalize_country(acc.country),
    'INTL'
  )                                                as country,
  ct.hubspot_contact_id,
  ct.created_at_hs                                 as contact_created_at,
  to_char(ct.created_at_hs, 'YYYY-MM')             as contact_created_month
from deals d
join pipeline_country_map pcm on pcm.pipeline_id = d.pipeline
left join contacts ct on ct.hubspot_contact_id = d.hubspot_contact_id
left join accounts acc on acc.hubspot_company_id = d.hubspot_company_id
left join lateral (
  select c.id, c.campaign_name, c.country_parsed
  from campaign_match_keys cmk
  join campaigns c on c.id = cmk.campaign_id
  where cmk.norm_key = ct.utm_campaign_norm
  limit 1
) cmp on true
where d.createdate is not null
  and (
    -- regla 0013: fuente del deal ≠ OFFLINE (NULL/vacío incluido, como antes)
    coalesce(d.analytics_source, '') != 'OFFLINE'
    -- fallback 0020: deal OFFLINE pero contacto Inbound explícito y no interno
    or (
      ct.lead_source = 'Inbound'
      and coalesce(ct.email, '') not ilike '%@dcycle.io'
    )
  );

-- Vistas KPI idénticas a 0019 (heredan el fallback vía deal_attribution).
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
    and coalesce(ct.email, '') not ilike '%@dcycle.io'
),
lead_agg as (
  select
    campaign_id, month,
    count(distinct contact_id)                            as leads,
    count(distinct contact_id) filter (where is_mql)      as mql
  from contact_campaign_month
  group by campaign_id, month
),
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
    and coalesce(ct.email, '') not ilike '%@dcycle.io'
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
