-- F2 — Capa de métricas. Vistas materializadas que cruzan paid + CRM por
-- `(channel, campaign, country, month)` (PRD §7). La UI lee de aquí.
-- Refresh disparado por los jobs de ingesta (sync-paid / sync-crm).

-- Spend agregado por (canal, campaña, país, mes). Si el contacto no casa
-- ningún `campaign_aliases`/`utm_manual_tags`/exacto, queda como "unmatched"
-- en Data Health y no entra aquí.
create materialized view if not exists kpi_by_campaign_month as
select
  c.source                       as channel,
  c.campaign_name                as campaign,
  coalesce(c.country_parsed,
           'Sin país / Multi')   as country,
  to_char(s.date, 'YYYY-MM')     as month,
  sum(s.spend)::numeric(14, 2)   as spend,
  sum(s.impressions)::bigint     as impressions,
  sum(s.clicks)::bigint          as clicks,
  -- Leads / MQL / SQL / pipeline se calculan desde `contacts` + `deals`
  -- vía join por utm_campaign_norm = campaign_name_norm (matching §8.1).
  (
    select count(*) from contacts ct
    where ct.utm_campaign_norm = c.campaign_name_norm
    and to_char(ct.created_at_hs, 'YYYY-MM') = to_char(s.date, 'YYYY-MM')
  )                              as leads,
  (
    select count(*) from contacts ct
    where ct.utm_campaign_norm = c.campaign_name_norm
    and ct.is_mql is true
    and to_char(ct.created_at_hs, 'YYYY-MM') = to_char(s.date, 'YYYY-MM')
  )                              as mql,
  (
    select count(distinct ct.id) from contacts ct
    join deals d on d.hubspot_contact_id = ct.hubspot_contact_id and d.amount > 0
    where ct.utm_campaign_norm = c.campaign_name_norm
    and to_char(ct.created_at_hs, 'YYYY-MM') = to_char(s.date, 'YYYY-MM')
  )                              as sql,
  (
    select coalesce(sum(d.amount), 0)::numeric(14, 2)
    from deals d
    join contacts ct on ct.hubspot_contact_id = d.hubspot_contact_id
    where ct.utm_campaign_norm = c.campaign_name_norm
    and to_char(ct.created_at_hs, 'YYYY-MM') = to_char(s.date, 'YYYY-MM')
  )                              as pipeline,
  (
    select coalesce(sum(d.amount), 0)::numeric(14, 2)
    from deals d
    join contacts ct on ct.hubspot_contact_id = d.hubspot_contact_id
    where ct.utm_campaign_norm = c.campaign_name_norm
    and d.dealstage = 'closedwon'
    and to_char(ct.created_at_hs, 'YYYY-MM') = to_char(s.date, 'YYYY-MM')
  )                              as closed_won
from campaigns c
join ad_spend_daily s on s.campaign_id = c.id
group by c.source, c.campaign_name, c.campaign_name_norm, c.country_parsed, to_char(s.date, 'YYYY-MM');

create index if not exists idx_kpi_campaign_month_keys
  on kpi_by_campaign_month (channel, month, country);

-- Vista agregada por canal+mes+país (input directo del Overview y Forecast).
create materialized view if not exists kpi_by_channel_month as
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

-- Función para refrescar todas las vistas tras un ingest. Idempotente.
create or replace function refresh_kpi_views()
returns void language sql as $$
  refresh materialized view kpi_by_campaign_month;
  refresh materialized view kpi_by_channel_month;
$$;
