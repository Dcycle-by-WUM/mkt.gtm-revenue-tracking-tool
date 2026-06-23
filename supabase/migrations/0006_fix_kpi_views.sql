-- Fix: usar amount_in_home_currency para pipeline/closed_won, LEFT JOIN
-- para no perder spend sin campaign_id, y REFRESH CONCURRENTLY.

-- Índices únicos necesarios para REFRESH CONCURRENTLY.
drop materialized view if exists kpi_by_channel_month;
drop materialized view if exists kpi_by_campaign_month;

create materialized view kpi_by_campaign_month as
select
  coalesce(c.source, s.source)   as channel,
  coalesce(c.campaign_name,
           'Sin campaña')        as campaign,
  coalesce(c.country_parsed,
           'Sin país / Multi')   as country,
  to_char(s.date, 'YYYY-MM')     as month,
  sum(s.spend)::numeric(14, 2)   as spend,
  sum(s.impressions)::bigint     as impressions,
  sum(s.clicks)::bigint          as clicks,
  (
    select count(*) from contacts ct
    where ct.utm_campaign_norm = coalesce(c.campaign_name_norm, '')
    and to_char(ct.created_at_hs, 'YYYY-MM') = to_char(s.date, 'YYYY-MM')
  )                              as leads,
  (
    select count(*) from contacts ct
    where ct.utm_campaign_norm = coalesce(c.campaign_name_norm, '')
    and ct.is_mql is true
    and to_char(ct.created_at_hs, 'YYYY-MM') = to_char(s.date, 'YYYY-MM')
  )                              as mql,
  (
    select count(distinct ct.id) from contacts ct
    join deals d on d.hubspot_contact_id = ct.hubspot_contact_id
      and coalesce(d.amount_in_home_currency, d.amount) > 0
    where ct.utm_campaign_norm = coalesce(c.campaign_name_norm, '')
    and to_char(ct.created_at_hs, 'YYYY-MM') = to_char(s.date, 'YYYY-MM')
  )                              as sql,
  (
    select coalesce(sum(coalesce(d.amount_in_home_currency, d.amount)), 0)::numeric(14, 2)
    from deals d
    join contacts ct on ct.hubspot_contact_id = d.hubspot_contact_id
    where ct.utm_campaign_norm = coalesce(c.campaign_name_norm, '')
    and to_char(ct.created_at_hs, 'YYYY-MM') = to_char(s.date, 'YYYY-MM')
  )                              as pipeline,
  (
    select coalesce(sum(coalesce(d.amount_in_home_currency, d.amount)), 0)::numeric(14, 2)
    from deals d
    join contacts ct on ct.hubspot_contact_id = d.hubspot_contact_id
    where ct.utm_campaign_norm = coalesce(c.campaign_name_norm, '')
    and d.dealstage = 'closedwon'
    and to_char(ct.created_at_hs, 'YYYY-MM') = to_char(s.date, 'YYYY-MM')
  )                              as closed_won
from ad_spend_daily s
left join campaigns c on s.campaign_id = c.id
group by coalesce(c.source, s.source), coalesce(c.campaign_name, 'Sin campaña'),
         coalesce(c.campaign_name_norm, ''), coalesce(c.country_parsed, 'Sin país / Multi'),
         to_char(s.date, 'YYYY-MM');

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

-- Ahora podemos usar REFRESH CONCURRENTLY (requiere unique index).
create or replace function refresh_kpi_views()
returns void language sql as $$
  refresh materialized view concurrently kpi_by_campaign_month;
  refresh materialized view concurrently kpi_by_channel_month;
$$;
