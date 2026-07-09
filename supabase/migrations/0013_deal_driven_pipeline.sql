-- Nuevo modelo de atribución para SQL/Pipeline/Closed Won (decidido con
-- Davide, 2026-07-09), a raíz de que el pipeline de julio salía muy por
-- debajo del real (12K en la app vs ~82K verificado en HubSpot vía el
-- campo `attribution`/champion, y ~93K si se cuenta cualquier
-- hs_analytics_source ≠ OFFLINE como pide negocio).
--
-- Causas raíz encontradas comparando deals reales de julio-2026:
--   - Pamesa (30.000€) y Tradivel (8.500€): su contacto asociado (champion)
--     es de feb-2025 y dic-2023 — anteriores a HUBSPOT_BACKFILL_FROM
--     (2025-12-01), así que ese contacto NUNCA se ingiere y el deal queda
--     sin forma de atribuirse a ningún canal/campaña. Pipeline invisible
--     del todo, no solo en el mes equivocado.
--   - Moove Cars (31.450€): contacto de jun-2026, deal de jul-2026 — el
--     pipeline SÍ se contaba, pero en junio (mes del contacto), no julio
--     (mes del deal), porque `kpi_by_campaign_month`/`kpi_organic_by_month`
--     atribuían todo por `contacts.created_at_hs`.
--
-- Decisión de negocio: SQL/Pipeline/Closed Won se atribuyen por el DEAL
-- (mes de `deals.createdate`, canal de `deals.analytics_source` — el
-- rollup "Original Traffic Source" que HubSpot calcula sobre el propio
-- deal, independiente de si el contacto está ingerido). Si el contacto
-- asociado SÍ está ingerido y su utm_campaign resuelve a una campaña real
-- (`campaign_match_keys`), se atribuye a esa campaña concreta; si no, se
-- atribuye solo por canal (LinkedIn/Google "Sin campaña", o al bucket
-- orgánico si la fuente no es paid). Se excluyen del todo los deals con
-- `analytics_source = 'OFFLINE'` — fuera de alcance de este tracker de
-- marketing (decisión de negocio explícita).
--
-- Leads/MQL NO cambian: siguen por contacto, mes de `contacts.created_at_hs`
-- — son el embudo de entrada, con su propia fecha natural.
--
-- Contrapartida a tener en cuenta: como esto puede ingerir contactos
-- (`lib/hubspot.ts:fetchDealLinkedContacts`) sin filtrar por lead_source
-- para no perder la atribución de canal/campaña del deal, se añade la
-- columna `contacts.lead_source` y se usa para blindar el leg de Leads/MQL
-- (que sigue siendo solo Inbound) — el leg de SQL/Pipeline no la necesita
-- porque su criterio de inclusión es `deals.analytics_source`, no el
-- contacto.

alter table deals add column if not exists analytics_source text;   -- hs_analytics_source del deal
alter table contacts add column if not exists lead_source text;      -- Inbound/Outbound/Referral

create index if not exists idx_deals_createdate on deals (createdate);

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
-- Leads/MQL — sin cambios de fondo: por contacto, mes del contacto. Se
-- blinda con lead_source por si el contacto solo entró vía deal (ver nota
-- de cabecera) y no es realmente Inbound.
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
-- SQL/Pipeline/Closed Won — por DEAL: mes y canal del propio deal, no del
-- contacto. Excluye OFFLINE (fuera de alcance).
deal_leg as (
  select
    d.hubspot_deal_id,
    coalesce(d.amount_in_home_currency, d.amount)  as amount,
    d.dealstage,
    d.analytics_source,
    to_char(d.createdate, 'YYYY-MM')               as month,
    ct.utm_campaign_norm
  from deals d
  left join contacts ct on ct.hubspot_contact_id = d.hubspot_contact_id
  where coalesce(d.analytics_source, '') != 'OFFLINE'
    and d.createdate is not null
),
-- Match por UTM del contacto asociado → campaña concreta (prioridad alta).
deal_campaign as (
  select dl.*, cmk.campaign_id
  from deal_leg dl
  join campaign_match_keys cmk on cmk.norm_key = dl.utm_campaign_norm
),
deal_agg as (
  select
    campaign_id, month,
    count(*) filter (where amount > 0)                                    as sql,
    coalesce(sum(amount), 0)::numeric(14, 2)                              as pipeline,
    coalesce(sum(amount) filter (where dealstage = 'closedwon'), 0)::numeric(14, 2)
                                                                            as closed_won
  from deal_campaign
  group by campaign_id, month
),
-- Sin match de campaña pero canal paid (por hs_analytics_source del deal)
-- → cae en el bucket "Sin campaña" del canal correspondiente.
deal_channel_fallback as (
  select
    case
      when dl.analytics_source = 'PAID_SOCIAL' then 'LinkedIn'
      when dl.analytics_source = 'PAID_SEARCH' then 'Google'
    end                                                                    as channel,
    dl.month,
    count(*) filter (where dl.amount > 0)                                  as sql,
    coalesce(sum(dl.amount), 0)::numeric(14, 2)                           as pipeline,
    coalesce(sum(dl.amount) filter (where dl.dealstage = 'closedwon'), 0)::numeric(14, 2)
                                                                            as closed_won
  from deal_leg dl
  where dl.analytics_source in ('PAID_SOCIAL', 'PAID_SEARCH')
    and not exists (
      select 1 from campaign_match_keys cmk where cmk.norm_key = dl.utm_campaign_norm
    )
  group by 1, dl.month
),
campaign_month_keys as (
  select campaign_id, month from spend_agg where campaign_id is not null
  union
  select campaign_id, month from lead_agg
  union
  select campaign_id, month from deal_agg
),
sin_campana_keys as (
  select channel, month from spend_agg where campaign_id is null
  union
  select channel, month from deal_channel_fallback
),
sin_campana_spend as (
  select channel, month,
    sum(spend)::numeric(14, 2) as spend,
    sum(impressions)::bigint   as impressions,
    sum(clicks)::bigint        as clicks
  from spend_agg
  where campaign_id is null
  group by channel, month
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
  'Sin país / Multi'                              as country,
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
left join sin_campana_spend scs on scs.channel = sck.channel and scs.month = sck.month
left join deal_channel_fallback dcf on dcf.channel = sck.channel and dcf.month = sck.month;

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

-- "Orgánico" = sin match de campaña Y canal no-paid (por hs_analytics_source
-- del deal, o por analytics_source del contacto para el leg de leads/MQL).
create materialized view kpi_organic_by_month as
with organic_contacts as (
  select
    ct.id,
    ct.is_mql,
    coalesce(ct.country_parsed, ct.country_raw, 'Sin país / Multi') as country,
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
    count(distinct id)                       as leads,
    count(distinct id) filter (where is_mql)  as mql
  from organic_contacts
  group by country, month
),
deal_organic_leg as (
  select
    coalesce(ct.country_parsed, ct.country_raw, 'Sin país / Multi') as country,
    to_char(d.createdate, 'YYYY-MM')                                as month,
    coalesce(d.amount_in_home_currency, d.amount)                   as amount,
    d.dealstage
  from deals d
  left join contacts ct on ct.hubspot_contact_id = d.hubspot_contact_id
  where coalesce(d.analytics_source, '') not in ('OFFLINE', 'PAID_SOCIAL', 'PAID_SEARCH')
    and d.createdate is not null
    and not exists (
      select 1 from campaign_match_keys cmk where cmk.norm_key = ct.utm_campaign_norm
    )
),
deal_agg as (
  select country, month,
    count(*) filter (where amount > 0)                                            as sql,
    coalesce(sum(amount), 0)::numeric(14, 2)                                      as pipeline,
    coalesce(sum(amount) filter (where dealstage = 'closedwon'), 0)::numeric(14, 2)
                                                                                    as closed_won
  from deal_organic_leg
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

-- refresh_kpi_views() (0009) ya apunta a estos 3 nombres por texto — no
-- necesita redefinirse.
