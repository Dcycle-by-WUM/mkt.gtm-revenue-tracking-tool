-- Taxonomía de canal nueva + exclusión de OFFLINE (decisión Davide,
-- 20-jul). Hasta ahora el canal era binario: PAID_SOCIAL→LinkedIn,
-- PAID_SEARCH→Google, y TODO lo demás caía en un cajón "Otros" (orgánico,
-- direct, email, offline, referrals, AI, other campaigns…). Davide pide
-- desglosarlo y, sobre todo, sacar OFFLINE de la plataforma:
--
--   Original Traffic Source (hs_analytics_source) → canal:
--     PAID_SOCIAL     → LinkedIn          (sin cambios)
--     PAID_SEARCH     → Google            (sin cambios)
--     ORGANIC_SEARCH  → Organic           (nuevo)
--     DIRECT_TRAFFIC  → Organic           (nuevo — Davide: cuenta como orgánico)
--     EMAIL_MARKETING → Email Marketing   (nuevo)
--     OTHER_CAMPAIGNS → Otros             (residual, "fine as it is")
--     AI_REFERRALS    → Otros             (residual)
--     SOCIAL_MEDIA    → Otros             (residual; Davide: "never used")
--     REFERRALS       → Otros             (residual; Davide: "never used")
--     OFFLINE         → EXCLUIDO          (la plataforma solo trackea inbound)
--     '' / null       → Otros             (sin etiqueta ≠ Offline; se mantiene)
--
-- OJO — interacción con la decisión #14 (migración 0020): un deal creado a
-- mano por sales sale OFFLINE a nivel de deal aunque su contacto sea
-- inbound de verdad (caso Stadler: deal OFFLINE, champion Nadya Paid
-- Search). "Excluir OFFLINE" NO puede significar "tirar Stadler" — Davide
-- quiere justo lo contrario. Por eso la exclusión es por CANAL RESUELTO,
-- no por la fuente cruda del deal:
--
--   canal del deal = primer no-nulo de:
--     1. paid_contact_channel  (0021: cualquier contacto asociado paid)
--     2. source_to_channel(fuente propia del deal)   (null si OFFLINE)
--     3. source_to_channel(fuente del contacto guardado)  (null si OFFLINE)
--   Si el canal resuelto es NULL (deal OFFLINE y contacto OFFLINE/sin
--   contacto, sin ningún contacto paid) → el deal se EXCLUYE.
--
-- Efecto: Stadler + los 3 del §5.5 siguen entrando (vía contacto paid);
-- un deal OFFLINE cuyo contacto es Organic/Email entra como
-- Organic/Email; solo desaparecen los deals sin ninguna señal de canal
-- inbound (OFFLINE de arriba a abajo) — que es exactamente lo que Davide
-- quiere fuera. Esto ESTRECHA la #14 (antes un deal OFFLINE con contacto
-- Inbound pero sin canal se quedaba en Otros; ahora se va). Ver DECISIONES
-- #16.
--
-- El mismo criterio se aplica a los LEADS (contactos) del bucket no-paid:
-- un contacto con Original Traffic Source = OFFLINE deja de contar como
-- lead (la plataforma solo trackea inbound). La vista de orgánico pasa a
-- llevar columna `channel` (Organic / Email Marketing / Otros) en vez de
-- agruparlo todo como "Otros".
--
-- Aplicar en el proyecto Supabase de producción (cwcvurrkqwifpngzecxu) —
-- ver instrucciones al final del PR / mensaje. Solo tiene efecto tras el
-- siguiente sync-crm.

-- Original Traffic Source (crudo de HubSpot) → canal de la plataforma.
-- NULL = OFFLINE (se excluye aguas arriba). '' no es OFFLINE → 'Otros'.
create or replace function source_to_channel(src text)
returns text language sql immutable as $$
  select case upper(coalesce(trim(src), ''))
    when 'PAID_SOCIAL'     then 'LinkedIn'
    when 'PAID_SEARCH'     then 'Google'
    when 'ORGANIC_SEARCH'  then 'Organic'
    when 'DIRECT_TRAFFIC'  then 'Organic'
    when 'EMAIL_MARKETING' then 'Email Marketing'
    when 'OFFLINE'         then null            -- excluido: no es inbound
    when 'SOCIAL_MEDIA'    then 'Otros'
    when 'REFERRALS'       then 'Otros'
    when 'OTHER_CAMPAIGNS' then 'Otros'
    when 'AI_REFERRALS'    then 'Otros'
    when ''                then 'Otros'         -- sin etiqueta ≠ Offline
    else 'Otros'                                -- valores futuros: visibles, no se tiran
  end
$$;

drop materialized view if exists kpi_by_channel_month;
drop materialized view if exists kpi_by_campaign_month;
drop materialized view if exists kpi_organic_by_month;
drop view if exists deal_attribution;

create view deal_attribution as
with base as (
  select
    d.hubspot_deal_id,
    d.dealname,
    d.createdate,
    d.amount,
    d.amount_in_home_currency,
    d.dealstage,
    d.is_closed_won,
    d.is_closed,
    d.pipeline,
    d.analytics_source,
    d.paid_contact_channel,
    pcm.label                                   as pipeline_label,
    pcm.region                                  as business_region,
    pcm.country                                 as pcm_country,
    ct.hubspot_contact_id                       as ct_id,
    ct.analytics_source                         as ct_source,
    ct.country_parsed                           as ct_country,
    ct.country_raw                              as ct_country_raw,
    ct.created_at_hs                            as ct_created_at,
    acc.country                                 as acc_country,
    cmp.id                                      as cmp_id,
    cmp.campaign_name                           as cmp_campaign,
    cmp.country_parsed                          as cmp_country,
    -- canal resuelto (ver cabecera): paid-contact > fuente del deal >
    -- fuente del contacto. NULL sólo si todo es OFFLINE/sin señal.
    coalesce(
      d.paid_contact_channel,
      source_to_channel(d.analytics_source),
      source_to_channel(ct.analytics_source)
    )                                           as resolved_channel
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
    and coalesce(ct.email, '') not ilike '%@dcycle.io'
)
select
  hubspot_deal_id,
  coalesce(dealname, hubspot_deal_id)              as dealname,
  to_char(createdate, 'YYYY-MM')                   as month,
  coalesce(amount_in_home_currency, amount)        as amount,
  dealstage,
  coalesce(is_closed_won, dealstage = 'closedwon', false) as is_closed_won,
  coalesce(is_closed, false)                       as is_closed,
  pipeline                                         as pipeline_id,
  pipeline_label,
  business_region,
  resolved_channel                                 as channel,
  case
    when paid_contact_channel is not null then 'contacto'
    when source_to_channel(analytics_source) is not null then 'deal'
    else 'contacto'
  end                                              as attribution_via,
  cmp_campaign                                     as campaign,
  cmp_id                                           as campaign_id,
  coalesce(
    pcm_country,
    cmp_country,
    ct_country,
    normalize_country(ct_country_raw),
    normalize_country(acc_country),
    'INTL'
  )                                                as country,
  ct_id                                            as hubspot_contact_id,
  ct_created_at                                    as contact_created_at,
  to_char(ct_created_at, 'YYYY-MM')                as contact_created_month
from base
-- Exclusión OFFLINE: fuera todo deal sin ningún canal inbound resuelto.
where resolved_channel is not null;

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

-- No-paid por mes, ahora con desglose de canal (Organic / Email Marketing
-- / Otros). Excluye contactos y deals OFFLINE (source_to_channel = null).
create materialized view kpi_organic_by_month as
with organic_contacts as (
  select
    ct.id,
    ct.is_mql,
    source_to_channel(ct.analytics_source) as channel,
    coalesce(ct.country_parsed, normalize_country(ct.country_raw), 'Sin país / Multi') as country,
    to_char(ct.created_at_hs, 'YYYY-MM') as month
  from contacts ct
  where coalesce(ct.analytics_source, '') not in ('PAID_SOCIAL', 'PAID_SEARCH')
    and source_to_channel(ct.analytics_source) is not null   -- fuera OFFLINE
    and ct.created_at_hs is not null
    and coalesce(ct.lead_source, 'Inbound') = 'Inbound'
    and coalesce(ct.email, '') not ilike '%@dcycle.io'
    and not exists (
      select 1 from campaign_match_keys cmk where cmk.norm_key = ct.utm_campaign_norm
    )
),
lead_agg as (
  select channel, country, month,
    count(distinct id)                        as leads,
    count(distinct id) filter (where is_mql)  as mql
  from organic_contacts
  group by channel, country, month
),
deal_agg as (
  select channel, country, month,
    count(*) filter (where amount > 0)                                    as sql,
    coalesce(sum(amount), 0)::numeric(14, 2)                              as pipeline,
    coalesce(sum(amount) filter (where is_closed_won), 0)::numeric(14, 2) as closed_won
  from deal_attribution
  where campaign_id is null and channel in ('Organic', 'Email Marketing', 'Otros')
  group by channel, country, month
),
keys as (
  select channel, country, month from lead_agg
  union
  select channel, country, month from deal_agg
)
select
  k.channel,
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
left join lead_agg la on la.channel = k.channel and la.country = k.country and la.month = k.month
left join deal_agg da on da.channel = k.channel and da.country = k.country and da.month = k.month;

create unique index idx_kpi_organic_month_unique
  on kpi_organic_by_month (channel, country, month);

-- refresh_kpi_views() (0009) sigue apuntando a los 3 nombres por texto.
