# 🧠 Racional refinado — Brief v2 (validado con datos reales)

> Esta es la versión refinada del brief tras estudiar el contexto y **validar contra los datos reales** vía MCP (HubSpot + Supermetrics). Donde difiere del brief original, **manda esta versión** (se indica en cada punto). Documento equivalente en `docs/BRIEF.md`. Espejo en Notion: *Brief — GTM / Revenue Tracking Tool* (sección "Racional refinado — Brief v2").

---

## A. Decisiones cerradas (esta ronda)

| Tema | Decisión |
| --- | --- |
| **Ingesta de paid** | **Solo Supermetrics API** (sin carga manual de CSV). Verificado: LinkedIn Ads (`LIA`) y Google Ads (`AW`) están **AUTENTICADOS** y permiten leer spend por **día × campaña**. *Sustituye* el "CSV semanal" del original. |
| **Form factor** | **App propia**: Next.js (**Netlify**) + Supabase (Postgres + Auth). *Cierra* la decisión abierta de form factor. |
| **Hosting** | **Netlify** (ya **no** Vercel). Jobs en Netlify Scheduled Functions o Supabase. |
| **SSO** | **Google Workspace** (OIDC). Toda persona entra por SSO; sin login local. |
| **Regla MQL** | MQL = contacto con `Lead Status` **distinto de `MK NOT QUALIFIED`** (y no vacío). Todos los estados menos "Not Qualified". *Ajusta* la definición original (ver B1). |
| **País LinkedIn** | Se atribuye por **`campaignGroupName`** (grupo), **nunca** por `campaign_name`. *Refina* la regla de país (ver F, regla de oro). |
| **Match UTM ↔ campaña** | Casan **CASI SIEMPRE** (exacto tras normalizar). Fuzzy solo como red de seguridad. |
| **`is_target_abm`** | Booleano por cuenta; se construye ya. Criterio final con **Paula**. |

## B. Hallazgos contra datos reales (vía MCP)

1. **Lead Status real (HubSpot):** `NEW, MQL, IN_SEQUENCE, CONVERSATION, MEETING, NURTURING, MK NOT QUALIFIED, OPEN_DEAL, CUSTOMER, Partner`. ⚠️ **No existen** "Closed Won" ni "Already in Database" como Lead Status (Closed Won es *stage de Deal*). Por eso la regla MQL se redefine como "todos menos `MK NOT QUALIFIED`".
2. **Original Traffic Source real:** `PAID_SOCIAL` (=LinkedIn) y `PAID_SEARCH` (=Google) **confirmados**. Además existe `AI_REFERRALS` (leads desde IA/LLMs → base del módulo **AEO**), más `ORGANIC_SEARCH`, `SOCIAL_MEDIA`, `DIRECT_TRAFFIC`, `EMAIL_MARKETING`, `REFERRALS`, `OTHER_CAMPAIGNS`, `OFFLINE`.
3. **UTMs reales mucho más sucios que la convención original.** Ejemplos reales: `esp_mensaje_españa_documento [mofu] ... juanjo | ...`; `int_doc_uk_errores_tiermulti [mofu] | ...`; `esp_ mensaje_…` (espacio suelto); Google: `carbon-footprint-software-de`, `lm_calculadora-hdc-2025-es`, `lm_A3_guia2026_ES`; sin país: `wb_…`, `taller-…`, `alcance-3-con-ia`. Hay propiedades duplicadas (`utm_campaign`, `utm__campaign`, `utm_campaign_`) → usar **`utm_campaign`** como canónica.
4. **Consecuencia:** el país NO siempre va tras `INT`, va en minúsculas y muchas campañas no llevan país → **motor de normalización + tabla de alias + overrides de país + fallback "Sin país / Multi" + etiquetado manual** (no opcional).

## C. Arquitectura técnica

- **Frontend + API:** Next.js (App Router) en **Netlify**; Server/Route Handlers (Netlify Functions) para todo lo que toque secretos.
- **Datos + Auth:** **Supabase** (Postgres + RLS; Auth con **Google Workspace** OIDC). Secretos (tokens HubSpot/Supermetrics) en env de Netlify / Supabase Vault; nunca en navegador.
- **Jobs:** **Netlify Scheduled Functions** (o Supabase): HubSpot frecuente; Supermetrics diario (re-refresca ventana de N días por correcciones de plataforma).
- **Roles vía RLS:** Admin / Marketing / SDR / Solo-lectura. Auditoría de cambios manuales (forecast, notas, overrides, tags de UTM).

## D. Fuentes de datos e ingesta (automática)

| Fuente | Método | Cadencia | Estado |
| --- | --- | --- | --- |
| **HubSpot** (contacts, deals, companies, engagements) | API privada (token server-side) | Continuo/horario | **API key pendiente** → MCP para prototipo/validación |
| **LinkedIn Ads** (`LIA`) | **Supermetrics API** — `campaignGroupName`, `campaignName`, `spend`/`spend_eur`, `impressions`, `clicks`, `date` | Diario | **Autenticado** ✅ |
| **Google Ads** (`AW`) | **Supermetrics API** (`asset_level=Campaign` + dimensión día) | Diario | **Autenticado** ✅ |
| **LinkedIn Companies Engagement Report** | Supermetrics (si lo expone) o export CSV de LinkedIn Campaign Manager | Semanal | A confirmar (alimenta Heat Score) |
| **GSC / Bing WMT / GA4** | Supermetrics API | Diario | Fase 2 (orgánico/AEO) |
| **SEO rank / DA** (Moz/Ahrefs/Semrush) | Supermetrics o API propia | Diario/semanal | Fase 2 — herramienta a confirmar |
| **AI Visibility** (Profound/Peec/Otterly/Semrush AI) | API / export | Semanal | Fase 2 — herramienta a confirmar |

**Idempotencia:** upsert por `(source, platform_campaign_id, date)`; re-sync no duplica spend. Cada run registra `last_covered_date` por fuente (sustituye el "último día cargado" del CSV).

> ⚠️ **Nota LinkedIn:** confirmar en `field_discovery` de Supermetrics que `campaignGroupName` está disponible; si no, pull directo de la **LinkedIn Marketing API** (`ad_analytics` con pivot por campaign group). Invariante: **el país se calcula desde el GRUPO**.

## E. Modelo de datos (Supabase / Postgres)

Amplía el modelo original con: `campaign_group_name` en `campaigns`/`ad_spend_daily`; tablas nuevas `campaign_aliases`, `country_overrides`, `utm_manual_tags`, `linkedin_company_engagement`, `heat_scores`, `sync_runs`, `app_users`; y campos extra en `contacts` para el Heat Score (`recent_conversion_date`, `recent_conversion_event_name`, `first_conversion_event_name`, `num_conversion_events`, `hs_email_last_open_date`, `hs_email_open`, `hs_email_click`, `hs_email_replied`, `hs_analytics_num_page_views`, `hs_email_optout`, `num_contacted_notes`, `job_title`, `email`). Vistas materializadas `kpi_by_campaign_month` y `kpi_by_channel_month` por `(channel, campaign, country, month)`.

## F. Motor de cruce / atribución

- **Normalización:** `lower` → `trim` → quitar acentos (`españa→espana`) → colapsar espacios → normalizar separadores (`| - _`) → clave canónica (segmento antes del primer `|`/`[`).
- **Matching:** 1) exacto sobre clave canónica (mayoría) → 2) alias → 3) tag manual → 4) fuzzy (similitud, umbral) con confirmación humana → 5) sin match → cola en *Data Health*. Puerta de canal: `PAID_SOCIAL`→LinkedIn, `PAID_SEARCH`→Google. Sin UTM → "Direct / Unknown".
- **País — regla de oro LinkedIn:** se determina por **`campaignGroupName`**, NUNCA por `campaign_name` (una campaña `..._LONDRES_...` dentro de un grupo UK solo se captura por grupo). Nomenclatura Dcycle: `INT_..._UK_...`, `INT_..._MULTI_..._UK_...`. Google: país por sufijo (`-es`, `-de`, `-fr`, `-en`). `country_overrides` para excepciones (`MEX_`, `US [BOFU]`, `[UK]`, `-ESP`, legacy). Fallback "Sin país / Multi".
- **Etiquetado manual de UTMs:** pantalla para asignar a mano país/canal/campaña a UTMs no resueltos; se guarda en `utm_manual_tags` (prioridad sobre el parser, con autor/fecha).
- **Definiciones:** Lead = contacto atribuido. MQL = `Lead Status` ∉ {`MK NOT QUALIFIED`, vacío}. SQL = contacto con Deal de `amount > 0`. Pipeline € = suma de `amount` de deals del contacto. Closed Won = deals con stage Closed Won. Fórmulas (CTR/CPC/CPM/CPL/CPMQL/CPSQL/ROI/%) = las del brief original.

## G. Pantallas (IA de la app)

1. **Login (SSO Google Workspace).**
2. **Overview "Cómo vamos"** — Spend, Leads, MQL, SQL, Pipeline €, Closed Won, ROI por canal; real vs objetivo con alertas; filtros globales (periodo/canal/país).
3. **Paid Media Performance** — tabla canal × campaña con todas las métricas; LinkedIn vs Google; tendencia.
4. **Campaign Detail** — spend timeline, embudo, contactos cruzados, estado de matching UTM, grupo/país, notas.
5. **Pipeline & Forecast vs Objetivos** — forecast manual por canal/mes/país; real desde HubSpot; % cumplimiento, pacing.
6. **Explorer / Desglose libre (pivot)** — pivotar por Canal/Campaña/País/Mes; vistas guardadas; notas.
7. **ABM — Cuentas** — cuentas-objetivo: estado, **Heat Score** (🔥/⚡/🌱/❄️), última actividad, SDR, ¿impactada por ads?.
8. **ABM — Account Timeline** — secuencia de eventos por empresa (engagements + deals) + impacto de paid.
9. **ABM — Heat Score / Señales de intención** — ranking pre-demo con desglose por señal; alerta SDR para 🔥.
10. **ABM — Overview por SDR** — cada SDR vs sus cuentas (`Contact owner`).
11. **Orgánico (SEO) + AEO** — ver sección I.
12. **Data Health** — frescura de sync por fuente, estado de jobs, colas de UTMs sin match / sin país, etiquetado manual, edición de alias y overrides.
13. **Admin / Settings** — usuarios/roles (SSO), conexiones, definiciones editables (regla MQL, mapa de país, pesos del Heat Score), objetivos.

## H. ABM — Heat Score "Pre-Demo" (algoritmo cerrado)

Puntúa la "temperatura" de un contacto antes de pedir demo = señales × recencia.

**Multiplicador de recencia** (días desde el evento): `≤3 ×2.0 · ≤7 ×1.6 · ≤14 ×1.3 · ≤30 ×1.0 · ≤60 ×0.6 · >60 ×0.3`. Dos recencias: `recency_conv` (desde `recent_conversion_date`) y `recency_email` (desde `hs_email_last_open_date`).

**Señales y puntos base:**
- Conversiones/descargas (`num_conversion_events`): ≥5 → +35; ≥3 → +30; =2 → +18 — `× recency_conv`.
- Email respondido (`hs_email_replied > 0`) → **+25 × recency_email** (señal fortísima).
- Email opens (`hs_email_open`): ≥10 → +12; ≥5 → +8; ≥3 → +5 — `× recency_email`.
- Email clicks (`hs_email_click`): ≥10 → +15; ≥5 → +10; ≥1 → +5 — `× recency_email`.
- Page views (`hs_analytics_num_page_views`): ≥20 → +8; ≥5 → +4 — `× recency_conv`.
- Webinar (`recent_conversion_event_name` contiene "webinar") → +8 × recency_conv.
- Demo (`recent_conversion_event_name` o `first_conversion_event_name` contiene "demo") → +20 × recency_conv.
- LinkedIn Ads — empresa engaged (cruce contra `linkedin_company_engagement`): Muy alto → +15; Alto → +8; Medio → +4 (**sin recency**).

**Score final:** `score = MIN(100, round(Σ puntos))`.

**Filtros de elegibilidad** (no entran al score):
- Query HubSpot: `num_conversion_events ≥ 2`; `lifecyclestage NOT IN [opportunity, customer, subscriber]`; `hs_email_optout ≠ true`; `num_contacted_notes is empty`; `hs_lead_status NOT IN [MK NOT QUALIFIED, NOT QUALIFIED, Disqualified]`.
- Junk (post-fetch por patrón): dominios email (educación `.edu/.ac.uk/...`, públicos `.gob.es/.gov.*/gencat.cat/...`, ONG `.ong/.ngo`, internos `@dcycle.io/+test`), empresas (Universidad/University/Ayuntamiento/Diputación/Gobierno/Ministerio/Hospital/Fundación/Asociación/Cámara de Comercio), job titles (becario/intern/trainee/prácticas/estudiante/junior/working student/praktikant), y cualquier `firstname`/`lastname`/`company` que contenga "test".

**Clasificación:** `≥70 🔥 Caliente` (alerta SDR inmediata) · `≥50 ⚡ Templado` (esta semana) · `≥30 🌱 Tibio` (nurturing) · `<30 ❄️ Frío`. Pesos/umbrales configurables en Admin; corre en job y persiste en `heat_scores` con breakdown.

## I. SEO orgánico + AEO

**SEO orgánico:**

| KPI | Definición | Fuente |
| --- | --- | --- |
| **Tráfico orgánico non-branded** | Sesiones/clics orgánicos excluyendo queries de marca (`brand_keywords`) | GSC (Supermetrics) + GA4 |
| **Domain Authority (DA)** | Autoridad de dominio (tendencia) | Moz/Ahrefs/Semrush |
| **Keywords estratégicas en Top 3** | Nº de keywords objetivo en posición ≤ 3 | GSC (position) y/o rank tracker |
| **Leads / MQLs orgánicos** | Contacts con `original_source = ORGANIC_SEARCH` (+ regla MQL) | HubSpot |
| **Deals generadas por SEO** | Deals de contactos orgánicos | HubSpot |
| **Pipeline SEO (€)** | Suma `amount` de deals de contactos orgánicos | HubSpot |

**AEO (Answer Engine Optimization):**

| KPI | Definición | Fuente |
| --- | --- | --- |
| **AI Visibility** | % de prompts estratégicos donde aparece Dcycle | Plataforma AI-visibility |
| **AI Share of Voice** | Cuota de aparición vs competidores | Plataforma AI-visibility |
| **Leads / Pipeline desde IA (€)** | Contactos/deals con `original_source = AI_REFERRALS` | HubSpot |
| **Bing** | Impresiones/clics/queries/posición | Bing Webmaster Tools (Supermetrics) |

> Tanto SEO como AEO conectan hasta **pipeline € y deals**, no se quedan en tráfico.

## J. Roadmap por fases

- **F0 — Scaffolding:** Next.js + Supabase + Netlify; SSO Google; migraciones; CI.
- **F1 — Ingesta + motor:** Supermetrics → `ad_spend_daily` (LIA por **grupo** + AW); HubSpot → contacts/deals/companies/activities; normalización + matching + país (regla de grupo) + colas de calidad + etiquetado manual.
- **F2 — Core analytics:** Overview, Paid Performance, Campaign Detail, Explorer, Data Health.
- **F3 — Objetivos + Notas.**
- **F4 — ABM:** Cuentas, Timeline, SDR, Paid↔ABM, **Heat Score**.
- **F5 — Orgánico (SEO) + AEO.**

## K. Decisiones abiertas / dependencias

1. **API key de HubSpot** — pendiente; bloquea ingesta CRM de producción.
2. **Cuentas ABM (`is_target_abm`)** — criterio final con **Paula**.
3. **`campaignGroupName` en Supermetrics LIA** — confirmar; si no, LinkedIn API directa.
4. **LinkedIn Companies Engagement Report** — confirmar si Supermetrics lo expone; si no, upload semanal (única excepción manual, solo Heat Score).
5. **Excepciones de país** — completar lista contra muestra real (grupos + sufijos + legacy).
6. **Afinado regla MQL** — decidir si `NEW`/`IN_SEQUENCE`/vacío deben quedar fuera.
7. **Herramienta SEO** (DA/rankings: Moz/Ahrefs/Semrush) — definir cuál.
8. **Plataforma AI-visibility** (Profound/Peec/Otterly/Semrush AI) — definir cuál + lista de prompts/competidores.
9. **Netlify Scheduled Functions** para los crons (o mover a Supabase).

## L. Glosario

- **Fuzzy match:** coincidencia *aproximada* por similitud textual (trigram/Levenshtein), no exacta. Aquí solo red de seguridad (el match exacto funciona casi siempre).
- **Campaign Group:** agrupador de LinkedIn que contiene varias campañas; el país/territorio se atribuye **por el grupo**, no por la campaña.
- **AEO (Answer Engine Optimization):** medición de visibilidad en motores de respuesta IA (ChatGPT, Perplexity…); se rastrea vía `AI_REFERRALS` + Bing.
- **Heat Score:** puntuación 0–100 de intención pre-demo (señales × recencia), en 🔥/⚡/🌱/❄️.
