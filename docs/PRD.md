# PRD — GTM Revenue Tracking Tool

> **Documento informativo y canónico.** Resume **qué hace** la herramienta, **con qué se
> conecta**, **qué lee de cada fuente**, **cómo cruza los datos** y **en qué estado está el
> código hoy**. Pensado para que producto, marketing, ventas, Ops/IT y desarrollo estén en
> la misma línea sin tener que leerse el brief entero.
>
> | | |
> |---|---|
> | **Producto** | `mkt.gtm-revenue-tracking-tool` |
> | **Equipo / hosting** | Dcycle · Netlify (Pro) + Supabase |
> | **Proyecto Netlify** | `dcycle-mkt-gtm-revenue-tracking-tool` (site ID `170e45ec-0ac4-4b40-a067-0f1a0d995ff3`) |
> | **Estado** | F0 (scaffolding) ✅ · camino Paid en curso · CRM/ABM/SEO pendientes de credenciales |
> | **Última actualización** | 2026-06-22 |
>
> Documentos relacionados: [`BRIEF.md`](BRIEF.md) (brief funcional+técnico completo) ·
> [`RACIONAL.md`](RACIONAL.md) (decisiones validadas con datos reales) ·
> [`CONEXIONES.md`](CONEXIONES.md) (runbook de Ops/IT) ·
> [`DECISIONES.md`](DECISIONES.md) (registro de decisiones) ·
> [`PREVIEW.md`](PREVIEW.md) (contenido de las pantallas).

---

## 1. Resumen ejecutivo

La GTM Revenue Tracking Tool es una **app propia** (Next.js en Netlify + Supabase) que
**unifica el gasto de paid media** (LinkedIn Ads + Google Ads) **con los resultados del CRM**
(HubSpot) y, en fases posteriores, lo amplía a **orgánico/SEO + AEO** (visibilidad en motores
de respuesta IA). El **pegamento** entre el mundo del gasto y el de los resultados es el
**`utm_campaign`**, que viaja del anuncio al contacto.

Con ese cruce, la herramienta responde preguntas que hoy viven en silos:

- **Control de inversión paid:** coste real vs resultado generado, por canal / campaña / país / mes.
- **Embudo atribuido:** Lead → MQL → SQL → Pipeline € → Closed Won, por canal y campaña.
- **Forecast vs objetivos** con alertas de desvío y *pacing*.
- **ABM:** timeline por cuenta, señales de intención (**Heat Score** pre-demo) y overview por SDR.
- **SEO + AEO:** tráfico non-branded, Domain Authority, keywords en Top 3 y visibilidad en IA
  (AI Visibility / Share of Voice), conectados hasta **pipeline € y deals** (no se quedan en tráfico).

---

## 2. Problema y objetivo

Hoy el dato vive en silos: el **gasto** (spend, impresiones, clics) en LinkedIn/Google Ads, y
los **resultados** (leads, MQL, SQL, pipeline, deals, actividad) en HubSpot. Sin cruzarlos no
hay control real de ROI por canal/campaña ni capacidad ABM.

**Objetivo:** una pieza estratégica + operativa que (a) unifique spend ↔ CRM por `utm_campaign`,
(b) permita fijar y medir objetivos, (c) dé control de inversión (coste real vs resultado) y
(d) habilite seguimiento ABM por cuenta con scoring de intención.

---

## 3. Usuarios y roles

Acceso **exclusivamente por SSO de Google Workspace** (OIDC); sin login local. Roles aplicados
vía RLS de Supabase, con auditoría de cambios manuales (forecast, notas, overrides, tags de UTM):

| Rol | Qué hace |
|---|---|
| **Admin** | Configura conexiones, definiciones de negocio (regla MQL, mapa de país, pesos del Heat Score), objetivos, usuarios/roles. |
| **Marketing** | Analiza paid/orgánico, edita forecast y notas, etiqueta manualmente UTMs y resuelve colas de calidad. |
| **SDR** | Consulta ABM: sus cuentas asignadas, timeline, leads calientes (Heat Score). |
| **Solo-lectura** | Consulta dashboards sin editar. |

---

## 4. Alcance

**En alcance (visión completa):** paid media (LinkedIn + Google), CRM (HubSpot), motor de cruce
UTM↔campaña con atribución de país, objetivos/forecast, ABM + Heat Score, y SEO/AEO.

**Fuera de alcance / no-objetivos:**

- **Carga manual de CSV de paid:** descartada. La ingesta de paid es **solo Supermetrics API**.
  (Única excepción manual posible: el *LinkedIn Companies Engagement Report* para Heat Score, si
  Supermetrics no lo expone — ver §10.)
- **Login local / gestión de contraseñas propias:** todo entra por SSO Google Workspace.
- **Edición de datos de origen** (HubSpot/Ads): la herramienta **lee**; no escribe en las fuentes.

---

## 5. Arquitectura y stack

```
Google Workspace SSO ──> Next.js (App Router, Netlify) ──> Supabase (Postgres + RLS + Auth)
                               │                                  ▲
                               │  Netlify Scheduled Functions      │ upserts idempotentes
                               ▼                                  │
               ┌───────────────────────────────────┐            │
               │ Servicios de ingesta (server-side) │────────────┘
               │  • Supermetrics API: LIA, AW        │  spend día × campaña (LinkedIn por GRUPO)
               │  • Supermetrics: GSC / Bing / GA4   │  orgánico/AEO (fase 2)
               │  • HubSpot API: contacts / deals /  │
               │    companies / engagements          │
               │  • LinkedIn Companies Engagement    │  (Heat Score)
               └───────────────────────────────────┘
```

- **Frontend + API:** Next.js (App Router) en **Netlify**. Server Actions / Route Handlers
  (Netlify Functions) para todo lo que toque secretos.
- **Datos + Auth:** **Supabase** (Postgres + RLS; Auth con Google Workspace OIDC). Los secretos
  (tokens HubSpot/Supermetrics) viven en env de Netlify / Supabase Vault; **nunca** en el navegador.
- **Jobs:** **Netlify Scheduled Functions** (o Supabase scheduled functions): HubSpot frecuente;
  Supermetrics diario (re-refresca una ventana de N días por correcciones de la plataforma).
- **Despliegue:** Netlify con `@netlify/plugin-nextjs`, Node 20, protección por contraseña en todos
  los deploys. `main` → producción; cada rama → branch deploy; cada PR → deploy preview.

> **Principio de robustez:** la app **arranca y despliega sin secretos**. Muestra datos de ejemplo
> y un aviso (`StatusBanner`) de qué falta conectar; las cifras reales aparecen al configurar las
> env vars. `lib/config.ts` detecta qué integración está viva.

---

## 6. Integraciones — con qué se conecta y qué lee

Las credenciales se configuran en **env vars de Netlify** (nunca en el repo). Runbook de alta en
[`CONEXIONES.md`](CONEXIONES.md).

| Fuente | Para qué | Método | Estado |
|---|---|---|---|
| **LinkedIn Ads** (`LIA`) | Spend/impresiones/clics paid social | Supermetrics API | ✅ autenticado · 🟡 falta token API |
| **Google Ads** (`AW`) | Spend/impresiones/clics paid search | Supermetrics API | ✅ autenticado · 🟡 falta token API |
| **HubSpot** | Contactos, deals, empresas, actividad (todo el funnel + ABM) | Private App token (server-side) | 🔴 **bloqueante** — API key pendiente |
| **Supabase** | Postgres (datos) + Auth (SSO) | Proyecto + service role | 🟡 por crear |
| **Google Workspace** | SSO (OIDC) | OAuth client | 🟡 por crear |
| **GSC / Bing WMT / GA4** | SEO/AEO (tráfico, queries, posición) | Supermetrics API | ⚪ fase 2 |
| **SEO rank / DA** (Moz/Ahrefs/Semrush) | Domain Authority, rankings | Supermetrics o API propia | ⚪ fase 2 — herramienta a confirmar |
| **AI Visibility** (Profound/Peec/Otterly/Semrush AI) | AI Visibility / Share of Voice | API / export | ⚪ fase 2 — plataforma a confirmar |

### 6.1 Qué lee exactamente de cada fuente

**LinkedIn Ads (Supermetrics `LIA`)** — `date`, `campaignGroupName`, `campaignName`, `spend`/`spend_eur`,
`impressions`, `clicks`.
⚠️ **Invariante crítico:** el **país se deriva del `campaignGroupName` (grupo), NUNCA del
`campaignName`** (§8.2). Confirmar en `field_discovery` que `campaignGroupName` está disponible; si
no, *pull* directo de la LinkedIn Marketing API (`ad_analytics` por campaign group).

**Google Ads (Supermetrics `AW`)** — `date`, `campaign`, `cost`, `impressions`, `clicks`
(con `asset_level = Campaign` + dimensión día).

**HubSpot — Contact:** `email`, `firstname`, `lastname`, `company`, `jobtitle`,
`hubspot_owner_id` (SDR), `lifecyclestage`, `hs_lead_status`, `hs_analytics_source`,
**`utm_campaign`** (canónica — ignorar `utm__campaign` / `utm_campaign_`), país.
*Para el Heat Score:* `num_conversion_events`, `recent_conversion_date`,
`recent_conversion_event_name`, `first_conversion_event_name`, `hs_email_last_open_date`,
`hs_email_open`, `hs_email_click`, `hs_email_replied`, `hs_analytics_num_page_views`,
`hs_email_optout`, `num_contacted_notes`.

**HubSpot — Deal:** `amount`, `amount_in_home_currency`, `dealstage`, `pipeline`, `createdate`,
`closedate` + asociación a contacto/empresa.

**HubSpot — Company:** `name`, `domain`, `industry`, `country`, `hubspot_owner_id`,
`is_target_abm` (propiedad custom a crear).

**HubSpot — Engagements:** meetings / notes / emails (timeline ABM).

**Scopes mínimos HubSpot (Private App, solo lectura):** `crm.objects.contacts.read`,
`crm.objects.deals.read`, `crm.objects.companies.read`, `crm.objects.owners.read`,
`crm.schemas.contacts.read`.

---

## 7. Modelo de datos (Supabase / Postgres)

Tablas principales (detalle de campos en [`BRIEF.md`](BRIEF.md) §6):

- **Dimensiones paid:** `campaigns` (incluye `campaign_group_name` y `country_parsed`),
  `ad_spend_daily` (PK `(source, platform_campaign_id, date)`, upsert idempotente).
- **Calidad / overrides:** `campaign_aliases`, `country_overrides`, `utm_manual_tags`, `sync_runs`.
- **CRM:** `contacts` (con `utm_campaign_raw`/`_norm`, `is_mql` derivado, `country_parsed`, y campos
  de Heat Score), `deals`, `accounts` (`is_target_abm`), `activities`.
- **ABM / Heat:** `linkedin_company_engagement`, `heat_scores` (score + band + breakdown jsonb).
- **Negocio:** `targets` (forecast), `notes`, `app_users` + `roles`.
- **Capa de métricas:** vistas materializadas `kpi_by_campaign_month` y `kpi_by_channel_month`
  por `(channel, campaign, country, month)`.

> **Construido hoy:** `supabase/migrations/0001_paid_core.sql` crea el **camino paid**
> (`campaigns`, `ad_spend_daily`, `campaign_aliases`, `country_overrides`, `sync_runs`). El camino
> CRM/ABM se añade cuando se desbloquee la API key de HubSpot.

---

## 8. Motor de cruce / atribución (el corazón de la tool)

### 8.1 Normalización y matching UTM ↔ campaña
Normalización: `lower` → `trim` → quitar acentos (`españa→espana`) → colapsar espacios →
normalizar separadores (`| - _`) → **clave canónica** (segmento antes del primer `|`/`[`).

Matching, en cascada: **1)** exacto sobre clave canónica (caso mayoritario) → **2)** alias
(`campaign_aliases`) → **3)** tag manual (`utm_manual_tags`) → **4)** fuzzy (trigram/Levenshtein,
umbral) con confirmación humana → **5)** sin match → cola en *Data Health*.
**Puerta de canal:** `PAID_SOCIAL` → LinkedIn, `PAID_SEARCH` → Google. Sin UTM → "Direct / Unknown".

### 8.2 País — regla de oro LinkedIn por Campaign Group
**Para LinkedIn, el país se determina por `campaignGroupName`, NUNCA por `campaign_name`.** Una
campaña `..._LONDRES_...` dentro de un grupo UK **solo** se captura por el grupo. Nomenclatura
Dcycle: `INT_..._UK_...`, `INT_..._MULTI_..._UK_...`. **Google:** país por sufijo (`-es`, `-de`,
`-fr`, `-en`). `country_overrides` para excepciones (`MEX_`, `US [BOFU]`, `[UK]`, `-ESP`, legacy).
Fallback visible y filtrable: "Sin país / Multi".

### 8.3 Definiciones de negocio (validadas con datos reales)
- **Lead:** todo contacto atribuido en el periodo.
- **MQL:** `hs_lead_status` ∉ {`MK NOT QUALIFIED`, vacío} (todos los estados menos "Not Qualified").
- **SQL:** contacto con Deal asociado de `amount > 0`.
- **Pipeline €:** suma de `amount` de deals asociados al contacto.
- **Closed Won:** deals con `dealstage` = Closed Won.

### 8.4 Fórmulas (implementadas en `lib/kpis.ts`)
| Métrica | Fórmula |
|---|---|
| CTR | Clics / Impresiones |
| CPC | Spend / Clics |
| CPM | (Spend / Impresiones) × 1000 |
| CPL / CPMQL / CPSQL | Spend / (Leads / MQL / SQL) |
| ROI | (Pipeline € − Spend) / Spend |
| % MQL/Lead · % SQL/MQL | Nº MQL / Leads · Nº SQL / MQL |

Todas las divisiones están protegidas contra 0 (devuelven `null` → se muestran como `—`).

---

## 9. Pantallas (arquitectura de información)

13 pantallas. La columna **Estado** refleja el código actual: *Live* = funcional con datos de
ejemplo; *Stub Fx* = navegable pero marcada como pendiente de la fase indicada.

| # | Pantalla | Propósito | Estado |
|---|---|---|---|
| 1 | **Login (SSO)** | Entrada por Google Workspace; rol al entrar | Pendiente (requiere Supabase Auth) |
| 2 | **Overview "Cómo vamos"** (`/`) | North-star: Spend, Leads, MQL, SQL, Pipeline €, Closed Won, ROI por canal; real vs objetivo + alertas; filtros globales | **Live** |
| 3 | **Paid Media Performance** (`/paid`) | Tabla canal × campaña con todas las métricas; LinkedIn vs Google; tendencia | **Live** |
| 4 | **Campaign Detail** (`/campaign-detail`) | Spend timeline, embudo, contactos cruzados, estado de matching UTM, grupo/país, notas | Stub F2 |
| 5 | **Pipeline & Forecast** (`/forecast`) | Forecast manual por canal/mes/país; real desde HubSpot; % cumplimiento, pacing | Stub F3 |
| 6 | **Explorer / pivot** (`/explorer`) | Pivotar cualquier métrica por Canal/Campaña/País/Mes; vistas guardadas; notas | Stub F2 |
| 7 | **ABM — Cuentas** (`/abm-accounts`) | Cuentas-objetivo: estado, Heat Score, última actividad, SDR, ¿impactada por ads? | Stub F4 |
| 8 | **ABM — Account Timeline** (`/abm-timeline`) | Secuencia de eventos por empresa (engagements + deals) + impacto de paid | Stub F4 |
| 9 | **ABM — Heat Score** (`/abm-heat`) | Ranking pre-demo con desglose por señal; alerta SDR para 🔥 | Stub F4 (algoritmo ya en `lib/heat.ts`) |
| 10 | **ABM — por SDR** (`/abm-sdr`) | Cada SDR vs sus cuentas (`Contact owner`) | Stub F4 |
| 11 | **Orgánico (SEO) + AEO** (`/organic`) | KPIs SEO + AEO conectados a pipeline € | Stub F5 |
| 12 | **Data Health** (`/data-health`) | Frescura de sync por fuente; colas de UTMs sin match / sin país; etiquetado manual; edición de alias y overrides | **Live** |
| 13 | **Admin / Settings** (`/admin`) | Usuarios/roles, conexiones, definiciones editables, objetivos | Stub F2 |

---

## 10. ABM — Heat Score "Pre-Demo"

Puntúa la "temperatura" de un contacto antes de pedir demo = **señales × recencia**. Algoritmo
**implementado** en `lib/heat.ts`.

**Multiplicador de recencia** (días desde el evento): `≤3 ×2.0 · ≤7 ×1.6 · ≤14 ×1.3 · ≤30 ×1.0 ·
≤60 ×0.6 · >60 ×0.3`. Dos recencias: `recency_conv` (desde `recent_conversion_date`) y
`recency_email` (desde `hs_email_last_open_date`).

**Señales y puntos base:** conversiones/descargas (≥5 → +35; ≥3 → +30; =2 → +18 · ×conv);
email respondido (+25 · ×email); email opens (≥10 → +12; ≥5 → +8; ≥3 → +5 · ×email); email clicks
(≥10 → +15; ≥5 → +10; ≥1 → +5 · ×email); page views (≥20 → +8; ≥5 → +4 · ×conv); webinar (+8 ·×conv);
demo (+20 ·×conv); LinkedIn empresa engaged (Muy alto +15 / Alto +8 / Medio +4, sin recency).
**Score = MIN(100, round(Σ puntos)).**

**Filtros de elegibilidad** (no entran al score): `num_conversion_events ≥ 2`; `lifecyclestage`
∉ [opportunity, customer, subscriber]; `hs_email_optout ≠ true`; `num_contacted_notes` vacío;
`hs_lead_status` ∉ [MK NOT QUALIFIED, NOT QUALIFIED, Disqualified]. Más filtros *junk* por patrón
(dominios educación/públicos/ONG/internos, empresas tipo universidad/administración, job titles
becario/intern/estudiante, y cualquier "test" en nombre/empresa).

**Clasificación:** `≥70 🔥 Caliente` (alerta SDR inmediata) · `≥50 ⚡ Templado` (esta semana) ·
`≥30 🌱 Tibio` (nurturing) · `<30 ❄️ Frío`. Pesos/umbrales **configurables** en Admin; corre en job
y persiste en `heat_scores` con breakdown. Detalle completo en [`BRIEF.md`](BRIEF.md) §9.

---

## 11. SEO orgánico + AEO (fase 5)

**SEO:** tráfico orgánico **non-branded** (GSC + GA4, separando branded vía `brand_keywords`),
**Domain Authority** (Moz/Ahrefs/Semrush), **keywords estratégicas en Top 3** (GSC/rank tracker),
y **Leads/MQLs/Deals/Pipeline € orgánicos** (`original_source = ORGANIC_SEARCH` en HubSpot).

**AEO (Answer Engine Optimization):** **AI Visibility** (% de prompts estratégicos donde aparece
Dcycle), **AI Share of Voice** vs competidores (plataforma de AI-visibility), **Leads/Pipeline €
desde IA** (`original_source = AI_REFERRALS`), y métricas de **Bing** (alimenta respuestas IA).

> Tanto SEO como AEO conectan hasta **pipeline € y deals**, no se quedan en métricas de tráfico,
> usando la misma puerta de canal (`original_source`) que el paid.

---

## 12. Estado del código (qué está construido hoy)

**F0 (scaffolding) ✅:** Next.js (App Router) + Netlify + navegación de las 13 pantallas + CI
(typecheck + build en cada push/PR) + despliegue continuo GitHub→Netlify.

| Módulo | Estado |
|---|---|
| `lib/kpis.ts` | ✅ Fórmulas de negocio (CTR/CPC/CPM/CPL/CPMQL/CPSQL/ROI/%), null-safe, formateadores ES |
| `lib/heat.ts` | ✅ Heat Score completo (recencia, señales, bandas, elegibilidad); `NOW` fijo para preview determinista |
| `lib/config.ts` | ✅ Detección de integraciones vivas por env var |
| `lib/store.ts` | ✅ Estado en `localStorage` para el prototipo (notas/forecast/overrides) — se reemplaza por Supabase |
| `lib/mock-data.ts` | ✅ Datos de ejemplo para las pantallas live |
| `lib/supermetrics.ts` | 🟡 **Esqueleto**: construye la request a Supermetrics, pero el mapeo del payload es `TODO` hasta tener token + validar `field_discovery` |
| `supabase/migrations/0001_paid_core.sql` | ✅ Esquema del camino paid; CRM pendiente de HubSpot |
| Pantallas live | ✅ Overview, Paid Media Performance, Data Health (con datos de ejemplo) |
| Resto de pantallas | 🟡 Stubs marcados por fase (F2–F5) |

**Variables de entorno** (`.env.example`): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPERMETRICS_API_KEY`,
`SUPERMETRICS_TEAM_ID`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
`HUBSPOT_PRIVATE_APP_TOKEN`.

---

## 13. Roadmap por fases

- **F0 — Scaffolding** ✅: Next.js + Supabase + Netlify; SSO Google; migraciones; CI.
- **F1 — Ingesta + motor:** Supermetrics → `ad_spend_daily` (LinkedIn por **grupo** + Google);
  HubSpot → contacts/deals/companies/activities; normalización + matching + país + colas de
  calidad + etiquetado manual.
- **F2 — Core analytics:** Overview, Paid Performance, Campaign Detail, Explorer, Data Health, Admin.
- **F3 — Objetivos + Notas.**
- **F4 — ABM:** Cuentas, Timeline, SDR, Paid↔ABM, Heat Score (incl. ingesta Companies Engagement Report).
- **F5 — Orgánico (SEO) + AEO.**

---

## 14. Seguridad y privacidad

- **Secretos** solo en env de Netlify / Supabase Vault; nunca en el repo ni en el navegador.
  Todo lo que toca tokens corre server-side (Route Handlers / Netlify Functions).
- **Acceso:** SSO Google Workspace restringido a dominio (`@dcycle.io` + los que se indiquen);
  roles vía **RLS** de Supabase. Auditoría de cambios manuales (forecast, notas, overrides, tags).
- **Deploys protegidos por contraseña** en todos los contextos (producción y previews).
- **Datos personales:** los contactos de HubSpot contienen PII. Lectura mínima necesaria; los
  filtros *junk* del Heat Score nunca exponen datos fuera de la herramienta.

---

## 15. Decisiones abiertas / dependencias

1. **API key de HubSpot** — pendiente; **bloquea** la ingesta CRM de producción.
2. **Cuentas ABM (`is_target_abm`)** — criterio final con **Paula**.
3. **`campaignGroupName` en Supermetrics `LIA`** — confirmar en `field_discovery`; si no, LinkedIn API directa.
4. **LinkedIn Companies Engagement Report** — confirmar si Supermetrics lo expone; si no, upload semanal (única excepción manual, solo Heat Score).
5. **Excepciones de país** — completar la lista contra muestra real (grupos + sufijos + legacy).
6. **Afinado de la regla MQL** — decidir si `NEW`/`IN_SEQUENCE`/vacío deben quedar fuera.
7. **Herramienta SEO** para DA/rankings (Moz/Ahrefs/Semrush) — definir cuál.
8. **Plataforma de AI-visibility** (Profound/Peec/Otterly/Semrush AI) — definir cuál + lista de prompts y competidores.
9. **Jobs de ingesta** — confirmar Netlify Scheduled Functions o mover los crons a Supabase.

---

## 16. Glosario

- **`utm_campaign`:** parámetro que viaja del anuncio al contacto; es el pegamento del cruce spend↔CRM.
- **Campaign Group:** agrupador de LinkedIn que contiene varias campañas; el **país se atribuye por
  el grupo**, no por la campaña.
- **Fuzzy match:** coincidencia aproximada por similitud textual (trigram/Levenshtein); aquí solo
  red de seguridad (el match exacto funciona casi siempre).
- **Heat Score:** puntuación 0–100 de intención de un contacto pre-demo (señales × recencia), en 🔥/⚡/🌱/❄️.
- **AEO (Answer Engine Optimization):** medición de visibilidad en motores de respuesta IA
  (ChatGPT, Perplexity…); se rastrea vía `AI_REFERRALS` + Bing.
</content>
</invoke>
