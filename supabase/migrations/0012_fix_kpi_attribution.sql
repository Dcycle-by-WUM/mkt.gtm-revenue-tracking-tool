-- Fix de dos bugs de atribución reportados sobre los datos de julio:
--
-- 1) `kpi_by_campaign_month` estaba dirigida por `ad_spend_daily`
--    (spend_agg era la tabla "left" del join): un campaign_id × month sin
--    fila de spend ese mes desaparecía ENTERO de la vista, aunque tuviera
--    leads/MQL/SQL/pipeline real en `crm_agg`. Con spend diario (Supermetrics,
--    ventana de 14 días) cualquier hueco de sync, campaña en pausa unos días
--    o filas todavía no ingeridas hace que el pipeline/MQL/SQL de esos leads
--    se pierda silenciosamente del mes — explica el pipeline de julio
--    incorrecto y las cifras por canal/campaña por debajo de lo real.
--    Fix: unir spend_agg y crm_agg por la UNIÓN de sus claves
--    (campaign_id, month), no por spend_agg sola, para que un mes con CRM
--    pero sin spend siga apareciendo (spend en 0).
--
-- 2) `kpi_organic_by_month` contaba como "orgánico" cualquier contacto con
--    `analytics_source` distinto de PAID_SOCIAL/PAID_SEARCH, sin excluir a
--    los que además tienen un `utm_campaign` que sí resuelve a una campaña
--    paid real (`campaign_match_keys`). Un contacto así se contaba a la vez
--    en el bucket orgánico Y en el de su campaña paid → doble conteo de
--    leads/MQL/SQL/pipeline en Overview (que suma ambos buckets). Fix:
--    "orgánico" = sin match de campaña, no solo `analytics_source` no-paid.

drop materialized view if exists kpi_by_channel_month;
drop materialized view if exists kpi_by_campaign_month;
drop materialized view if exists kpi_organic_by_month;

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
),
-- Claves (campaign_id, month) con actividad en CUALQUIERA de las dos
-- fuentes — antes solo se conservaban las de spend_agg.
campaign_month_keys as (
  select campaign_id, month from spend_agg where campaign_id is not null
  union
  select campaign_id, month from crm_agg
)
select
  c.source                                       as channel,
  c.campaign_name                                 as campaign,
  coalesce(c.country_parsed, 'Sin país / Multi')  as country,
  k.month,
  coalesce(sa.spend, 0)                           as spend,
  coalesce(sa.impressions, 0)                     as impressions,
  coalesce(sa.clicks, 0)                          as clicks,
  coalesce(ca.leads, 0)                           as leads,
  coalesce(ca.mql, 0)                             as mql,
  coalesce(ca.sql, 0)                             as sql,
  coalesce(ca.pipeline, 0)                        as pipeline,
  coalesce(ca.closed_won, 0)                      as closed_won
from campaign_month_keys k
join campaigns c on c.id = k.campaign_id
left join spend_agg sa on sa.campaign_id = k.campaign_id and sa.month = k.month
left join crm_agg ca on ca.campaign_id = k.campaign_id and ca.month = k.month
union all
-- Spend sin campaign_id resuelto ("Sin campaña") — sin CRM asociable, igual que antes.
select sa.channel, sa.campaign, sa.country, sa.month, sa.spend, sa.impressions, sa.clicks,
  0::bigint, 0::bigint, 0::bigint, 0::numeric(14, 2), 0::numeric(14, 2)
from spend_agg sa
where sa.campaign_id is null;

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

-- "Orgánico" = sin match de campaña paid (antes: solo `analytics_source`
-- no-paid, lo que dejaba contar dos veces a quien sí tenía match).
create materialized view kpi_organic_by_month as
with organic_contacts as (
  select
    ct.id,
    ct.hubspot_contact_id,
    ct.is_mql,
    coalesce(ct.country_parsed, ct.country_raw, 'Sin país / Multi') as country,
    to_char(ct.created_at_hs, 'YYYY-MM') as month
  from contacts ct
  where coalesce(ct.analytics_source, '') not in ('PAID_SOCIAL', 'PAID_SEARCH')
    and ct.created_at_hs is not null
    and not exists (
      select 1 from campaign_match_keys cmk where cmk.norm_key = ct.utm_campaign_norm
    )
)
select
  oc.country,
  oc.month,
  0::numeric(14, 2)                              as spend,
  0::bigint                                      as impressions,
  0::bigint                                      as clicks,
  count(distinct oc.id)                          as leads,
  count(distinct oc.id) filter (
    where oc.is_mql
  )                                               as mql,
  count(distinct oc.id) filter (
    where coalesce(d.amount_in_home_currency, d.amount) > 0
  )                                               as sql,
  coalesce(sum(coalesce(d.amount_in_home_currency, d.amount)), 0)::numeric(14, 2)
                                                  as pipeline,
  coalesce(sum(coalesce(d.amount_in_home_currency, d.amount))
    filter (where d.dealstage = 'closedwon'), 0)::numeric(14, 2)
                                                  as closed_won
from organic_contacts oc
left join deals d on d.hubspot_contact_id = oc.hubspot_contact_id
group by oc.country, oc.month;

create unique index idx_kpi_organic_month_unique
  on kpi_organic_by_month (country, month);

-- refresh_kpi_views() (0009) ya apunta a estos 3 nombres por texto — no
-- necesita redefinirse.
