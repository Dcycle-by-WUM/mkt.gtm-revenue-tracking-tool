-- Fix: usar amount_in_home_currency para pipeline/closed_won, LEFT JOIN
-- para no perder spend sin campaign_id, y REFRESH CONCURRENTLY.

drop materialized view if exists kpi_by_channel_month;
drop materialized view if exists kpi_by_campaign_month;

create materialized view kpi_by_campaign_month as
with base as (
  select
    coalesce(c.source, s.source)              as channel,
    coalesce(c.campaign_name, 'Sin campaña')  as campaign,
    coalesce(c.campaign_name_norm, '')         as campaign_norm,
    coalesce(c.country_parsed, 'Sin país / Multi') as country,
    to_char(s.date, 'YYYY-MM')               as month,
    s.spend,
    s.impressions,
    s.clicks
  from ad_spend_daily s
  left join campaigns c on s.campaign_id = c.id
)
select
  channel, campaign, country, month,
  sum(spend)::numeric(14, 2)   as spend,
  sum(impressions)::bigint     as impressions,
  sum(clicks)::bigint          as clicks,
  (
    select count(*) from contacts ct
    where ct.utm_campaign_norm = b.campaign_norm
    and to_char(ct.created_at_hs, 'YYYY-MM') = b.month
  )                              as leads,
  (
    select count(*) from contacts ct
    where ct.utm_campaign_norm = b.campaign_norm
    and ct.is_mql is true
    and to_char(ct.created_at_hs, 'YYYY-MM') = b.month
  )                              as mql,
  (
    select count(distinct ct.id) from contacts ct
    join deals d on d.hubspot_contact_id = ct.hubspot_contact_id
      and coalesce(d.amount_in_home_currency, d.amount) > 0
    where ct.utm_campaign_norm = b.campaign_norm
    and to_char(ct.created_at_hs, 'YYYY-MM') = b.month
  )                              as sql,
  (
    select coalesce(sum(coalesce(d.amount_in_home_currency, d.amount)), 0)::numeric(14, 2)
    from deals d
    join contacts ct on ct.hubspot_contact_id = d.hubspot_contact_id
    where ct.utm_campaign_norm = b.campaign_norm
    and to_char(ct.created_at_hs, 'YYYY-MM') = b.month
  )                              as pipeline,
  (
    select coalesce(sum(coalesce(d.amount_in_home_currency, d.amount)), 0)::numeric(14, 2)
    from deals d
    join contacts ct on ct.hubspot_contact_id = d.hubspot_contact_id
    where ct.utm_campaign_norm = b.campaign_norm
    and d.dealstage = 'closedwon'
    and to_char(ct.created_at_hs, 'YYYY-MM') = b.month
  )                              as closed_won
from base b
group by channel, campaign, campaign_norm, country, month;

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

create or replace function refresh_kpi_views()
returns void language sql as $$
  refresh materialized view concurrently kpi_by_campaign_month;
  refresh materialized view concurrently kpi_by_channel_month;
$$;
