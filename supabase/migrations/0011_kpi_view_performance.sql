-- `kpi_by_campaign_month` (migración 0008) ejecutaba 5 subqueries
-- correlacionadas (leads/mql/sql/pipeline/closed_won) POR CADA fila de
-- salida (campaign_id × month), cada una escaneando `contacts`/`deals` de
-- nuevo. Con datos de prueba (unas pocas filas) no se notaba; con el
-- volumen real de HubSpot (miles de contactos acumulados desde dic-2025)
-- el refresh de la vista se volvió lo bastante lento como para tirar el
-- timeout de la función de carga de LinkedIn Ads — cada subir de CSV
-- termina llamando a `refresh_kpi_views()`.
--
-- Reescrita para que el cruce CRM (contacts + deals → campaign_id, month)
-- se calcule UNA sola vez con joins + group by, y luego se una a los
-- totales de spend — en vez de recalcularse 5×N veces. Mismo criterio de
-- matching (campaign_match_keys, migración 0008) y mismo cuidado con el
-- fan-out contacto↔deals (dedupe por contact_id vía count(distinct),
-- verificado antes en kpi_organic_by_month con un contacto de 2 deals).

drop materialized view if exists kpi_by_channel_month;
drop materialized view if exists kpi_by_campaign_month;

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
-- Cada contacto resuelto a su campaña vía campaign_match_keys (exacto +
-- alias + tag manual). Un contacto sin match no aparece aquí — igual que
-- antes, no cuenta para ninguna campaña.
contact_campaign_month as (
  select
    ct.id                                 as contact_id,
    ct.hubspot_contact_id,
    ct.is_mql,
    cmk.campaign_id,
    to_char(ct.created_at_hs, 'YYYY-MM')  as month
  from contacts ct
  join campaign_match_keys cmk on cmk.norm_key = ct.utm_campaign_norm
  where ct.created_at_hs is not null
),
crm_agg as (
  select
    ccm.campaign_id,
    ccm.month,
    count(distinct ccm.contact_id)                                              as leads,
    count(distinct ccm.contact_id) filter (where ccm.is_mql)                    as mql,
    count(distinct ccm.contact_id) filter (
      where coalesce(d.amount_in_home_currency, d.amount) > 0
    )                                                                            as sql,
    coalesce(sum(coalesce(d.amount_in_home_currency, d.amount)), 0)::numeric(14, 2)
                                                                                  as pipeline,
    coalesce(sum(coalesce(d.amount_in_home_currency, d.amount))
      filter (where d.dealstage = 'closedwon'), 0)::numeric(14, 2)
                                                                                  as closed_won
  from contact_campaign_month ccm
  left join deals d on d.hubspot_contact_id = ccm.hubspot_contact_id
  group by ccm.campaign_id, ccm.month
)
select
  sa.channel, sa.campaign, sa.country, sa.month,
  sa.spend, sa.impressions, sa.clicks,
  coalesce(ca.leads, 0)       as leads,
  coalesce(ca.mql, 0)         as mql,
  coalesce(ca.sql, 0)         as sql,
  coalesce(ca.pipeline, 0)    as pipeline,
  coalesce(ca.closed_won, 0)  as closed_won
from spend_agg sa
left join crm_agg ca on ca.campaign_id = sa.campaign_id and ca.month = sa.month;

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

-- Índice para que el join de contact_campaign_month contra campaign_match_keys
-- (evaluado en cada refresh) no dependa de un seq scan de contacts.
create index if not exists idx_contacts_created_at_hs on contacts (created_at_hs);
