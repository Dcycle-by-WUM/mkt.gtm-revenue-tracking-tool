-- Bucket "Orgánico" para el funnel mensual (Overview §9.2 / hoja FORECASTS
-- "Organic Demo Requests"). Antes de esta migración, `listCampaigns()` solo
-- mostraba leads orgánicos como fallback CUANDO `kpi_by_campaign_month`
-- estaba vacía del todo — en cuanto entra spend de LinkedIn (aunque sea de
-- una sola campaña), esa vista deja de estar vacía y los leads orgánicos
-- desaparecen de Overview por completo (la vista solo agrega desde
-- `ad_spend_daily`, que nunca tiene filas orgánicas). Esta vista corre
-- siempre, en paralelo a la paid, no como fallback.
--
-- "Orgánico" = todo contacto cuyo `analytics_source` no sea un canal paid
-- (PAID_SOCIAL/PAID_SEARCH) — mismo criterio que `sourceToChannel` en
-- lib/data/campaigns.ts.

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

create or replace function refresh_kpi_views()
returns void language sql as $$
  refresh materialized view concurrently kpi_by_campaign_month;
  refresh materialized view concurrently kpi_by_channel_month;
  refresh materialized view concurrently kpi_organic_by_month;
$$;
