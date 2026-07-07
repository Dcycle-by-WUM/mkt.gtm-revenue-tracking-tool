-- Cierra el hueco de la cascada de matching (PRD §8.1). Hasta ahora
-- `kpi_by_campaign_month` solo casaba `contacts.utm_campaign_norm` contra
-- `campaigns.campaign_name_norm` (paso "exacto"); `campaign_aliases` y
-- `utm_manual_tags` existían en el schema pero ningún consumidor los leía.
--
-- Validado contra datos reales (HubSpot + export LinkedIn, jul-2026): el
-- join exacto resuelve ~77% de los leads PAID_SOCIAL. El resto son en su
-- mayoría UTMs puestos a nivel Ad Set (no Campaign) por LinkedIn — el caso
-- que `campaign_aliases` está pensado para resolver a mano desde Data
-- Health una vez tiene un consumidor real.

drop materialized view if exists kpi_by_channel_month;
drop materialized view if exists kpi_by_campaign_month;

-- Universo de claves UTM que resuelven a cada campaña: la propia clave
-- canónica + alias + tags manuales. Fuzzy (paso "d" de la cascada) se deja
-- fuera a propósito: requiere confirmación humana, que aterriza aquí como
-- alias una vez decidida (Data Health → "UTMs sin match").
create or replace view campaign_match_keys as
select id as campaign_id, campaign_name_norm as norm_key from campaigns
union
select campaign_id, norm_key from campaign_aliases
union
select campaign_id, utm_norm from utm_manual_tags;

create materialized view kpi_by_campaign_month as
with base as (
  select
    c.id                                            as campaign_id,
    coalesce(c.source, s.source)                    as channel,
    coalesce(c.campaign_name, 'Sin campaña')        as campaign,
    coalesce(c.country_parsed, 'Sin país / Multi')  as country,
    to_char(s.date, 'YYYY-MM')                      as month,
    s.spend, s.impressions, s.clicks
  from ad_spend_daily s
  left join campaigns c on s.campaign_id = c.id
)
select
  b.channel, b.campaign, b.country, b.month,
  sum(b.spend)::numeric(14, 2)   as spend,
  sum(b.impressions)::bigint     as impressions,
  sum(b.clicks)::bigint          as clicks,
  (
    select count(*) from contacts ct
    where ct.utm_campaign_norm in (
      select norm_key from campaign_match_keys where campaign_id = b.campaign_id
    )
    and to_char(ct.created_at_hs, 'YYYY-MM') = b.month
  )                              as leads,
  (
    select count(*) from contacts ct
    where ct.utm_campaign_norm in (
      select norm_key from campaign_match_keys where campaign_id = b.campaign_id
    )
    and ct.is_mql is true
    and to_char(ct.created_at_hs, 'YYYY-MM') = b.month
  )                              as mql,
  (
    select count(distinct ct.id) from contacts ct
    join deals d on d.hubspot_contact_id = ct.hubspot_contact_id
      and coalesce(d.amount_in_home_currency, d.amount) > 0
    where ct.utm_campaign_norm in (
      select norm_key from campaign_match_keys where campaign_id = b.campaign_id
    )
    and to_char(ct.created_at_hs, 'YYYY-MM') = b.month
  )                              as sql,
  (
    select coalesce(sum(coalesce(d.amount_in_home_currency, d.amount)), 0)::numeric(14, 2)
    from deals d
    join contacts ct on ct.hubspot_contact_id = d.hubspot_contact_id
    where ct.utm_campaign_norm in (
      select norm_key from campaign_match_keys where campaign_id = b.campaign_id
    )
    and to_char(ct.created_at_hs, 'YYYY-MM') = b.month
  )                              as pipeline,
  (
    select coalesce(sum(coalesce(d.amount_in_home_currency, d.amount)), 0)::numeric(14, 2)
    from deals d
    join contacts ct on ct.hubspot_contact_id = d.hubspot_contact_id
    where ct.utm_campaign_norm in (
      select norm_key from campaign_match_keys where campaign_id = b.campaign_id
    )
    and d.dealstage = 'closedwon'
    and to_char(ct.created_at_hs, 'YYYY-MM') = b.month
  )                              as closed_won
from base b
group by b.campaign_id, b.channel, b.campaign, b.country, b.month;

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

-- refresh_kpi_views() ya apunta a estos nombres por texto (create or replace
-- en 0006) — no necesita redefinirse aquí.
