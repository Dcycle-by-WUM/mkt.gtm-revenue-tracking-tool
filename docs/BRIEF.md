# Brief — Herramienta de Tracking GTM (Paid Media + Orgánico)

> Documento base para pasar a PRD. Define **qué hace** la herramienta, **qué tiene**, **qué pantallas** queremos y **cómo se cruzan los KPIs**. Pensado para control de **paid media** (LinkedIn + Google Ads) y **orgánico/AEO** (GSC/Bing/GA/AI), unificando spend con resultados de **HubSpot**.

---

## 1. Contexto y problema

Hoy el dato vive en silos: el **gasto** (spend, impresiones, clics) en LinkedIn/Google Ads, y los **resultados** (leads, MQL, SQL, pipeline, deals, actividad) en HubSpot. El único pegamento entre ambos mundos es el **`utm_campaign`**, que viaja del anuncio al contacto. Sin cruzarlos no hay control real de ROI por canal/campaña ni capacidad ABM.

**Objetivo:** una pieza estratégica+operativa que (a) unifique spend ↔ CRM por `utm_campaign`, (b) permita fijar y medir objetivos, (c) dé control de inversión (coste real vs resultado) y (d) habilite seguimiento ABM por cuenta con scoring de intención.

---

## 2. Decisiones cerradas

| Tema | Decisión |
| --- | --- |
| **Ingesta de paid** | **Solo Supermetrics API** (sin carga manual de CSV). Verificado: LinkedIn Ads (`LIA`) y Google Ads (`AW`) están **AUTENTICADOS** y permiten leer spend por **día × campaña**. |
| **Form factor** | **App propia**: Next.js (Netlify) + Supabase (Postgres + Auth). Pantallas a medida + módulo ABM. |
| **SSO** | **Google Workspace** (OIDC). Toda persona entra por SSO; sin login local. |
| **Regla MQL** | MQL = contacto con `hs_lead_status` **distinto de `MK NOT QUALIFIED`** (y no vacío). Todos los estados menos "Not Qualified". |
| **País LinkedIn** | Se atribuye por **`campaignGroupName`** (grupo), **nunca** por `campaign_name`. Ver §7.3 (regla de oro). |
| **Match UTM↔campaña** | `utm_campaign` y `campaign_name` casan **CASI SIEMPRE** (exacto tras normalizar). Fuzzy solo como red de seguridad. |
| **`is_target_abm`** | Booleano por cuenta; construir ya con el enfoque propuesto. Criterio final se afina con **Paula**. |

> "Solo Supermetrics API" **resuelve sin código de parsing** los 3 dolores del brief original (preámbulo LinkedIn, "Google sin fecha por fila", dedup). El "último día cargado" pasa a ser **frescura de sync por fuente** (pantalla *Data Health*).

---

## 3. Hallazgos contra datos reales (validados vía MCP)

1. **Lead Status real (HubSpot):** `NEW, MQL, IN_SEQUENCE, CONVERSATION, MEETING, NURTURING, MK NOT QUALIFIED, OPEN_DEAL, CUSTOMER, Partner`. **No existen** "Closed Won" ni "Already in Database" como Lead Status (Closed Won es *stage de Deal*). MQL = todos menos `MK NOT QUALIFIED`.
2. **Original Traffic Source real:** `PAID_SOCIAL`(=LinkedIn) y `PAID_SEARCH`(=Google) **confirmados**. Además `AI_REFERRALS` (leads desde IA/LLMs → base del módulo **AEO**), `ORGANIC_SEARCH`, `SOCIAL_MEDIA`(orgánico), `DIRECT_TRAFFIC`, `EMAIL_MARKETING`, `REFERRALS`, `OTHER_CAMPAIGNS`, `OFFLINE`.
3. **UTMs reales mucho más sucios que la convención original.** Reales: `esp_mensaje_españa_documento [mofu] ... juanjo | ...`; `int_doc_uk_errores_tiermulti [mofu] | ...`; `esp_ mensaje_…` (espacio suelto); Google: `carbon-footprint-software-de`, `lm_calculadora-hdc-2025-es`, `lm_A3_guia2026_ES`; sin país: `wb_…`, `taller-…`, `alcance-3-con-ia`. Propiedades duplicadas/sucias: usar **`utm_campaign`** como canónica (ignorar `utm__campaign`, `utm_campaign_`).
4. **El match exacto suele funcionar tras normalizar** (lo confirma el equipo) → normalización + alias/overrides para el resto, fuzzy como último recurso.

---

## 4. Arquitectura técnica

```
Google Workspace SSO ──> Next.js (Netlify) ──>  Supabase (Postgres + RLS + Auth)
                              │                        ▲
                              │  Netlify Scheduled Fns  │ upserts idempotentes
                              ▼                        │
              ┌──────────────────────────────┐        │
              │ Ingestion services (server)   │────────┘
              │  • Supermetrics API: LIA, AW   │  (spend día×campaña, por GRUPO)
              │  • Supermetrics: GSC/Bing/GA   │  (orgánico/AEO, fase 2)
              │  • HubSpot API: contacts/deals │
              │    companies/engagements       │
              │  • LinkedIn Companies          │  (Companies Engagement Report)
              │    Engagement Report           │
              └──────────────────────────────┘
```

- **Frontend + API:** Next.js (App Router) en **Netlify**; Server Actions / Route Handlers (Netlify Functions) para todo lo que toque secretos.
- **Datos + Auth:** **Supabase** (Postgres + RLS; Auth con **Google Workspace** OIDC). Secretos (tokens HubSpot/Supermetrics) en env de Netlify / Supabase Vault; nunca en navegador.
- **Jobs:** **Netlify Scheduled Functions** (o Supabase scheduled functions): HubSpot frecuente; Supermetrics diario (re-refresca ventana de N días por correcciones de plataforma).
- **Roles vía RLS:** Admin / Marketing / SDR / Solo-lectura. Auditoría de cambios manuales (forecast, notas, overrides, tags de UTM).

---

## 5. Fuentes de datos e ingesta (automática)

| Fuente | Método | Cadencia | Estado |
| --- | --- | --- | --- |
| **HubSpot** (contacts, deals, companies, engagements) | API privada (token server-side) | Continuo/horario | **API key pendiente** → MCP para prototipo/validación |
| **LinkedIn Ads** (`LIA`) | **Supermetrics API** — campos `campaignGroupName`, `campaignName`, `spend`/`spend_eur`, `impressions`, `clicks`, `date` (día) | Diario | **Autenticado** ✅ |
| **Google Ads** (`AW`) | **Supermetrics API** (`asset_level=Campaign` + dimensión día) | Diario | **Autenticado** ✅ |
| **LinkedIn Companies Engagement Report** | Supermetrics (si expone report de company engagement) **o** export CSV de LinkedIn Campaign Manager | Semanal | A confirmar (alimenta Heat Score, §9) |
| **GSC / Bing WMT / GA4** | Supermetrics API | Diario | Fase 2 (orgánico/AEO) |
| **SEO rank / DA** (Moz / Ahrefs / Semrush) | Supermetrics API (si conectado) o API propia de la herramienta | Diario/semanal | Fase 2 — herramienta a confirmar |
| **AI Visibility** (Profound / Peec AI / Otterly / Semrush AI) | API / export de la plataforma | Semanal | Fase 2 — herramienta a confirmar |

**Idempotencia:** upsert por `(source, platform_campaign_id, date)`; re-sync no duplica spend. Cada run registra `last_covered_date` por fuente.

> ⚠️ **Nota técnica LinkedIn:** la config Supermetrics `LIA` no usa *report type selection*; hay que confirmar en `field_discovery` que `campaignGroupName` está disponible. Si no lo estuviera, pull directo de la **LinkedIn Marketing API** (`ad_analytics` con pivot por campaign group). El invariante a respetar es: **el país/territorio se calcula desde el GRUPO** (§7.3).

---

## 6. Modelo de datos (Supabase / Postgres)

- **`accounts`** (Company): `hubspot_id` (PK), `name`, `domain`, `industry`, `country`, `owner_id` (SDR), `is_target_abm` (bool), `updated_at`.
- **`contacts`**: `hubspot_id` (PK), `account_id`, `original_source`, `channel` (derivado), `utm_campaign_raw`, `utm_campaign_norm`, `campaign_id` (match, nullable), `lifecycle_stage`, `lead_status`, `is_mql` (derivado), `country_parsed`, `owner_id`, `created_at`. **+ campos para Heat Score:** `recent_conversion_date`, `recent_conversion_event_name`, `first_conversion_event_name`, `num_conversion_events`, `hs_email_last_open_date`, `hs_email_open`, `hs_email_click`, `hs_email_replied`, `hs_analytics_num_page_views`, `hs_email_optout`, `num_contacted_notes`, `job_title`, `email`.
- **`deals`**: `hubspot_id`, `contact_id`, `account_id`, `amount`, `amount_home_currency`, `stage`, `is_closed_won`, `pipeline`, `created_at`, `close_date`.
- **`activities`** (engagements/meetings/notes/timeline): `hubspot_id`, `account_id`, `contact_id`, `type`, `timestamp`. → timeline ABM.
- **`campaigns`** (dimensión): `id`, `source`, `platform_campaign_id`, `campaign_group_name`, `campaign_name`, `campaign_name_norm`, `status`, `country_parsed` (de grupo en LinkedIn), `first_seen`, `last_seen`.
- **`ad_spend_daily`**: `(source, platform_campaign_id, date)` (PK), `campaign_id`, `campaign_group_name`, `spend`, `currency`, `impressions`, `clicks`, `synced_at`.
- **`campaign_aliases`**: `utm_campaign_norm` / `campaign_name_norm` → `campaign_id` canónico (overrides manuales).
- **`country_overrides`**: `pattern`/`token` → `country` (excepciones: `MEX_`, `US [BOFU]`, `[UK]`, `-ESP`, marca/legacy; grupos LinkedIn `INT_..._UK_...`, `INT_..._MULTI_..._UK_...`).
- **`utm_manual_tags`**: `utm_campaign_norm` → `{country, channel?, campaign_id?, notes}` con autor/fecha (etiquetado manual, §7.4).
- **`linkedin_company_engagement`**: `company_name`(+match a `account_id`), `engagement_level` (Muy alto/Alto/Medio), `period`, `source_file`.
- **`heat_scores`**: `contact_id`, `score`, `band` (Caliente/Templado/Tibio/Frío), `computed_at`, `breakdown` (jsonb con puntos por señal).
- **`targets`** (forecast manual): `channel`, `month`, `country`, `target_spend`, `target_leads`, `target_mql`, `target_pipeline`.
- **`notes`**: `scope_type` (campaign/period/account), `scope_ref`, `text`, `author`, `created_at`.
- **`sync_runs`**: `source`, `started_at`, `finished_at`, `status`, `rows`, `last_covered_date`.
- **`app_users`** + `roles`: `email`, `role`, `linked_owner_id`.

**Capa de métricas:** vistas materializadas `kpi_by_campaign_month` y `kpi_by_channel_month` por `(channel, campaign, country, month)`.

---

## 7. Motor de cruce / atribución (corazón de la tool)

### 7.1 Normalización
`lower()` → `trim()` → quitar acentos (`españa→espana`) → colapsar espacios → normalizar separadores (`| - _`) → derivar **clave canónica** (segmento antes del primer `|`/`[`). Se guarda `*_norm` en `contacts` y `campaigns`.

### 7.2 Matching campaña ↔ utm
1. **Exacto** sobre clave canónica (caso mayoritario: "casi siempre"). 2. **Alias** (`campaign_aliases`). 3. **Manual tag** (`utm_manual_tags`). 4. **Fuzzy** (similitud trigram/Levenshtein, umbral configurable) → sugerencia que un humano confirma. 5. **Sin match** → cola en *Data Health*; el lead va al bucket del canal sin campaña. **Puerta de canal:** `PAID_SOCIAL`→LinkedIn, `PAID_SEARCH`→Google. Sin UTM → **"Direct / Unknown"**.

### 7.3 País — **regla de oro LinkedIn por Campaign Group**
**Para LinkedIn, el país/territorio se determina por `campaignGroupName`, NUNCA por `campaign_name`.** Filtrar/atribuir por nombre de campaña pierde campañas cuyo grupo es de un país pero la campaña se llama distinto (p.ej. grupo UK con campaña `..._LONDRES_...`).

- **Mecanismo:** al ingestar LinkedIn se trae `campaignGroupName`; el país se deriva del grupo (`campaignGroupName =@ UK`, `=@ ESP`, etc., por territorio).
- **Nomenclatura de grupos Dcycle:** `INT_..._UK_...` (internacional UK), `INT_..._MULTI_..._UK_...` (multi-país con UK incluido). Variantes de campaña hija a vigilar: `..._UK_...`, `..._LONDRES_...` (no lleva UK → solo se captura por grupo), `..._LONDON_...` (futuro).
- **Google:** país por sufijo de campaña (`-es`, `-de`, `-fr`, `-en` genérico salvo override).
- **`country_overrides`** para excepciones (`MEX_`, `US [BOFU]`, `[UK]`, `-ESP`, marca/legacy).
- **Fallback:** "Sin país / Multi" (visible, filtrable, etiquetable a mano).

### 7.4 Etiquetado manual de UTMs
Pantalla para que Marketing **asigne a mano** país (y opcionalmente canal/campaña) a `utm_campaign` que no resuelven automáticamente (sin país, naming legacy, multi-país). Se persiste en `utm_manual_tags` y tiene prioridad sobre el parser; con autor/fecha para auditoría.

### 7.5 Definiciones de negocio
- **Lead:** todo contacto atribuido en el periodo.
- **MQL:** `hs_lead_status` ∉ {`MK NOT QUALIFIED`, vacío}.
- **SQL:** contacto con Deal asociado de `amount > 0` (todo SQL fue MQL → `% SQL/MQL`).
- **Pipeline €:** suma de `amount` de deals asociados al contacto.
- **Closed Won / ingresos:** suma de deals con `dealstage` = Closed Won.

### 7.6 Fórmulas
| Métrica | Fórmula |
| --- | --- |
| CTR | Clics / Impresiones |
| CPC | Spend / Clics |
| CPM | (Spend / Impresiones) × 1000 |
| CPL / CPMQL / CPSQL | Spend / (Leads / MQL / SQL) |
| ROI | (Pipeline € − Spend) / Spend |
| % MQL/Lead, % SQL/MQL | Nº MQL / Leads · Nº SQL / MQL |

---

## 8. Pantallas (IA de la app)

1. **Login (SSO Google Workspace)** — sin formulario local; control de rol al entrar.
2. **Overview "Cómo vamos"** — North-star: Spend, Leads, MQL, SQL, Pipeline €, Closed Won, ROI por canal; **real vs objetivo** con **alertas de desvío**; filtros globales (periodo/canal/país).
3. **Paid Media Performance** — tabla multicanal por **canal × campaña** con todo: Spend, Impr, Clics, CTR, CPC, CPM, Leads, MQL, SQL, CPL, CPMQL, CPSQL, Pipeline €, Closed Won, ROI, %MQL/Lead, %SQL/MQL. LinkedIn vs Google; columnas/orden configurables; tendencia.
4. **Campaign Detail** — spend timeline, embudo Lead→MQL→SQL→Pipeline→Won, contactos cruzados, **estado de matching UTM**, grupo/país, notas.
5. **Pipeline & Forecast vs Objetivos** — entrada **manual** de forecast por canal/mes/país; real consolidado desde HubSpot; **% cumplimiento**, alertas, pacing.
6. **Explorer / Desglose libre (pivot)** — pivotar cualquier métrica por **Canal / Campaña / País / Mes** combinables; guardar vistas; exportar; notas inline.
7. **ABM — Cuentas** — cuentas-objetivo: estado, **Heat Score (banda 🔥/⚡/🌱/❄️)**, última actividad, SDR, ¿impactada por ads?. Ordenable por score.
8. **ABM — Account Timeline** — secuencia temporal por empresa (descargó doc → visitó pricing → demo → oportunidad…) desde engagements + deals; cruce con impacto de paid.
9. **ABM — Heat Score / Señales de intención** — ranking de contactos pre-demo con desglose de puntos por señal; alertas SDR para 🔥 Caliente (ver §9).
10. **ABM — Overview por SDR** — cada SDR vs sus cuentas asignadas (`Contact owner`), estado, última actividad y leads calientes.
11. **Orgánico (SEO) + AEO (fase 2)** — KPIs SEO: **tráfico orgánico non-branded**, **Domain Authority (DA)**, **keywords estratégicas en Top 3**, **Leads/MQLs orgánicos**, **Deals y Pipeline € generados por SEO**. KPIs AEO: **AI Visibility** (% de prompts estratégicos donde aparecemos), **AI Share of Voice** vs competidores, **pipeline generado por tráfico de IA** (`AI_REFERRALS`). Fuentes: GSC/Bing/GA + herramienta de rank/DA + plataforma de AI-visibility (ver §10).
12. **Data Health (ingesta & calidad)** — frescura de sync por fuente (último día cubierto), estado de jobs, **cola de UTMs sin match**, **cola de campañas/UTMs sin país**, **etiquetado manual de UTMs** (§7.4), edición de `campaign_aliases` y `country_overrides`.
13. **Admin / Settings** — usuarios/roles (SSO), conexiones (HubSpot/Supermetrics/LinkedIn), **definiciones de negocio editables** (regla MQL, mapa de país, pesos del Heat Score), objetivos.

---

## 9. Módulo ABM + Heat Score "Pre-Demo"

**Identificación de cuentas-objetivo:** `is_target_abm` (bool por Company) — construir ya; criterio final con **Paula**.

**Timeline por empresa**, **overview por SDR**, **cruce Paid ↔ ABM** (qué cuentas-objetivo impactamos con ads vs cuáles avanzan en funnel).

### Heat Score Pre-Demo (algoritmo cerrado)
Puntúa la "temperatura" de un contacto antes de pedir demo, combinando señales × recencia.

**1) Multiplicador de recencia** (días desde el evento):
`≤3 ×2.0 · ≤7 ×1.6 · ≤14 ×1.3 · ≤30 ×1.0 · ≤60 ×0.6 · >60 ×0.3`. Dos recencias: `recency_conv` (desde `recent_conversion_date`) y `recency_email` (desde `hs_email_last_open_date`).

**2) Señales y puntos base:**
- **Conversiones/descargas** (`num_conversion_events`): ≥5 → +35; ≥3 → +30; =2 → +18 — todas `× recency_conv`.
- **Email respondido** (`hs_email_replied > 0`) → **+25 × recency_email** (señal fortísima).
- **Email opens** (`hs_email_open`): ≥10 → +12; ≥5 → +8; ≥3 → +5 — `× recency_email`.
- **Email clicks** (`hs_email_click`): ≥10 → +15; ≥5 → +10; ≥1 → +5 — `× recency_email`.
- **Page views** (`hs_analytics_num_page_views`): ≥20 → +8; ≥5 → +4 — `× recency_conv`.
- **Webinar** (`recent_conversion_event_name` contiene "webinar") → +8 × recency_conv.
- **Demo** (`recent_conversion_event_name` o `first_conversion_event_name` contiene "demo") → +20 × recency_conv.
- **LinkedIn Ads — empresa engaged** (cruce contra `linkedin_company_engagement`): Muy alto → +15; Alto → +8; Medio → +4 (**sin recency**).

**Score final:** `score = MIN(100, round(Σ puntos))`.

**3) Filtros de elegibilidad** (no entran al score):
- En query HubSpot: `num_conversion_events ≥ 2`; `lifecyclestage NOT IN [opportunity, customer, subscriber]`; `hs_email_optout ≠ true`; `num_contacted_notes is empty` (nadie le ha tocado nunca); `hs_lead_status NOT IN [MK NOT QUALIFIED, NOT QUALIFIED, Disqualified]`.
- **Junk (post-fetch por patrón):**
  - Dominios email: educación (`.edu, .ac.uk, .ac.jp, urjc.es, ufv.es, upm.es, ub.edu, uam.es, ucm.es, ie.edu, iese.edu, esade.edu, @campus., student.`…), públicos (`.gob.es, .gov.*, .gouv.*, gencat.cat, miteco.es, sepe.es`…), ONG (`.ong, .ngo`), internos (`@dcycle.io, +test, +otro`).
  - Empresas por nombre: `Universidad/University/College/Hochschule`, `Ayuntamiento/Ajuntament/Diputación/Generalitat/Xunta/Gobierno/Ministerio/Hospital/Sanidad`, `Fundación/Foundation/Asociación/ONG/Cámara de Comercio`.
  - Job titles: `becario/intern/trainee/prácticas/estudiante/student/aprendiz/junior/working student/praktikant`.
  - Nombres: si `firstname`/`lastname`/`company` contiene "test".

**4) Clasificación:** `≥70 🔥 Caliente` (alerta SDR inmediata) · `≥50 ⚡ Templado` (esta semana) · `≥30 🌱 Tibio` (nurturing) · `<30 ❄️ Frío` (sin acción).

> Pesos y umbrales **configurables** en Admin. El cálculo corre en job programado y persiste en `heat_scores` (con breakdown).

---

## 10. Módulo SEO orgánico + AEO

### 10.1 SEO orgánico — KPIs y fuentes
| KPI | Definición | Fuente |
| --- | --- | --- |
| **Tráfico orgánico non-branded** | Sesiones/clics orgánicos **excluyendo queries de marca** (usar `brand_keywords` para separar branded vs non-branded) | GSC (Supermetrics, setting `brand_keywords`) + GA4 |
| **Domain Authority (DA)** | Autoridad de dominio (tendencia) | Herramienta SEO (Moz/Ahrefs/Semrush) |
| **Keywords estratégicas en Top 3** | Nº de keywords objetivo en posición ≤ 3 | GSC (position) y/o rank tracker (Semrush/Ahrefs) |
| **Leads / MQLs orgánicos** | Contacts con `original_source = ORGANIC_SEARCH` (+ regla MQL) | HubSpot |
| **Deals generadas por SEO** | Deals asociados a contactos orgánicos | HubSpot |
| **Pipeline SEO (€)** | Suma `amount` de deals de contactos orgánicos | HubSpot |

### 10.2 AEO (Answer Engine Optimization) — KPIs y fuentes
| KPI | Definición | Fuente |
| --- | --- | --- |
| **AI Visibility** | % de prompts estratégicos donde aparece Dcycle | Plataforma AI-visibility (Profound/Peec/Otterly/Semrush AI) |
| **AI Share of Voice** | Cuota de aparición vs competidores en esos prompts | Plataforma AI-visibility |
| **Leads / Pipeline desde IA (€)** | Contactos/deals con `original_source = AI_REFERRALS` | HubSpot |
| **Bing** | Impresiones/clics/queries/posición (alimenta respuestas IA) | Bing Webmaster Tools (Supermetrics) |

> Requiere **dos fuentes nuevas a confirmar** (§12): (a) herramienta SEO para DA/rankings, (b) plataforma de AI-visibility para prompts/share of voice. El resto sale de GSC/Bing/GA (Supermetrics) + HubSpot, cruzado por la misma puerta de canal (`original_source`) que el paid. Tanto SEO como AEO conectan hasta **pipeline € y deals** (no se quedan en métricas de tráfico).

---

## 11. Roadmap por fases

- **F0 — Scaffolding:** Next.js + Supabase + Netlify; SSO Google; migraciones §6; CI.
- **F1 — Ingesta + motor:** Supermetrics→`ad_spend_daily` (LIA por **grupo** + AW); HubSpot→contacts/deals/companies/activities; normalización + matching + país (regla de grupo) + colas de calidad + etiquetado manual.
- **F2 — Core analytics:** Overview, Paid Performance, Campaign Detail, Explorer, Data Health.
- **F3 — Objetivos + Notas.**
- **F4 — ABM:** Cuentas, Timeline, SDR, Paid↔ABM, **Heat Score** (incl. ingesta Companies Engagement Report).
- **F5 — Orgánico (SEO) + AEO:** GSC/Bing/GA + DA/rankings + AI Visibility/Share of Voice; cruce a deals/pipeline €.

---

## 12. Decisiones abiertas / dependencias

1. **API key de HubSpot** (backend seguro) — pendiente; bloquea ingesta CRM de producción.
2. **Identificación de cuentas ABM** — criterio final con **Paula** (se construye ya con `is_target_abm`).
3. **`campaignGroupName` en Supermetrics LIA** — confirmar en `field_discovery`; si no, pull directo LinkedIn API (`ad_analytics` por grupo).
4. **LinkedIn Companies Engagement Report** — confirmar si Supermetrics lo expone; si no, upload semanal del CSV (única excepción manual, solo para Heat Score).
5. **Excepciones de país** — completar lista contra muestra real (grupos + sufijos + legacy).
6. **Afinado regla MQL** — confirmada "todos menos Not Qualified"; decidir si `NEW`/`IN_SEQUENCE`/vacío deben quedar fuera.
7. **Pesos Heat Score** — versión inicial = la de §9; ajustables en Admin.
8. **Alcance orgánico/AEO v2** — métricas y cruce GSC/Bing/GA/AI.
9. **Herramienta SEO** para Domain Authority y rankings (Moz / Ahrefs / Semrush) — definir cuál y si está disponible vía Supermetrics o por su propia API.
10. **Plataforma de AI-visibility** para AI Visibility / Share of Voice (Profound, Peec AI, Otterly, Semrush AI Toolkit…) — definir cuál y lista de prompts estratégicos + competidores a monitorizar.
11. **Hosting confirmado: Netlify** (sustituye a Vercel) — confirmar que Netlify Scheduled Functions cubre los jobs de ingesta, o mover los crons a Supabase scheduled functions.

---

## 13. Glosario

- **Fuzzy match:** coincidencia *aproximada* por similitud textual (trigram/Levenshtein), no exacta. Aquí solo red de seguridad (el match exacto funciona casi siempre).
- **Campaign Group (grupo de campañas):** agrupador de LinkedIn que contiene varias campañas; el **país/territorio se atribuye por el grupo**, no por la campaña.
- **AEO (Answer Engine Optimization):** optimización/medición de visibilidad en motores de respuesta IA (ChatGPT, Perplexity…); aquí se rastrea vía `AI_REFERRALS` + Bing.
- **Heat Score:** puntuación 0–100 de intención de un contacto pre-demo (señales × recencia), clasificada en 🔥/⚡/🌱/❄️.

---

## 14. Verificación (end-to-end)

- **Ingesta paid:** `data_query` Supermetrics LIA (con `campaignGroupName`) y AW por `campaign × day`; comparar spend mensual vs UI de plataforma; validar que campañas `..._LONDRES_...` caen en país UK por grupo.
- **Ingesta CRM / reglas:** conteo MQL (todos menos `MK NOT QUALIFIED`), SQL = deals amount>0, Pipeline/Closed Won.
- **Cruce extremo a extremo:** reconciliar `esp_mensaje_españa_…` (LinkedIn/España) y `lm_calculadora-hdc-2025-es` (Google/España): spend ↔ leads ↔ MQL ↔ SQL ↔ pipeline ↔ ROI.
- **Heat Score:** recalcular sobre muestra conocida y validar bandas + filtros de elegibilidad/junk.
- **Calidad:** colas "sin match" y "sin país" < umbral en Data Health.
- **Deploy:** preview en **Netlify** + login SSO Google + smoke test de pantallas core.

---

> **Próximo paso:** convertir este brief en PRD (historias + criterios de aceptación por pantalla) y arrancar F0.
