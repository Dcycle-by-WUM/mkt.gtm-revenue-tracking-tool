# 🔌 Guía de conexiones (runbook para Ops / IT)

Qué conectar, **con qué credenciales**, **qué campos exactos** y **dónde acaba cada dato** en la herramienta. Pensado para que Ops pueda dar de alta las integraciones sin leerse el brief entero.

> ⚠️ **Mergear el PR no conecta nada.** Mergear solo mete el código en `main`. Las
> conexiones son configuración manual: se crean tokens/apps en cada herramienta y
> se pegan en las **env vars de Netlify** (team Dcycle). El código ya está
> preparado para leerlas (`lib/config.ts` detecta qué hay conectado).

---

## 🧠 La lógica en 1 minuto

El **pegamento** entre el gasto (Ads) y los resultados (CRM) es el **`utm_campaign`**:
el anuncio lleva un `utm_campaign` → el contacto que entra en HubSpot lo conserva →
casamos ese `utm_campaign` con el `campaign_name` de Ads. Con eso atribuimos
spend → leads → MQL → SQL → pipeline → revenue por canal / campaña / país / mes.
(Detalle del motor de cruce en [`BRIEF.md`](BRIEF.md) §7.)

---

## 1. LinkedIn Ads — vía **Supermetrics** (`ds_id = LIA`)

- **Estado:** ✅ ya autenticado en Supermetrics. Solo falta el **token de API** (`SUPERMETRICS_API_KEY`, `SUPERMETRICS_TEAM_ID`).
- **Campos a traer:** `date`, `campaignGroupName`, `campaignName`, `spend` (coste), `impressions`, `clicks`.
- **Regla de oro (§7.3):** el **país se deriva del `campaignGroupName`** (grupo), NUNCA del nombre de campaña. ⚠️ Confirmar en `field_discovery` de Supermetrics que `campaignGroupName` está disponible; si no, pull directo de la LinkedIn Marketing API.
- **Dónde acaba:** tablas `campaigns` + `ad_spend_daily` (upsert idempotente por `source, platform_campaign_id, date`).
- **Lo usa:** Overview, Paid Performance, Campaign Detail, Explorer, Forecast.

## 2. Google Ads — vía **Supermetrics** (`ds_id = AW`)

- **Estado:** ✅ ya autenticado. Mismo token que LinkedIn.
- **Campos:** `date`, `campaign`, `cost`, `impressions`, `clicks`, con `asset_level = Campaign` + dimensión día.
- **País:** por sufijo de campaña (`-es`, `-de`, `-fr`, `-en`), con overrides para excepciones.
- **Dónde acaba:** igual que LinkedIn (`campaigns` + `ad_spend_daily`).

## 3. HubSpot — **Private App token** (`HUBSPOT_PRIVATE_APP_TOKEN`)  🔴 bloqueante

- **Qué crear:** una **Private App** en HubSpot con token de solo lectura.
- **Scopes mínimos:** `crm.objects.contacts.read`, `crm.objects.deals.read`, `crm.objects.companies.read`, `crm.objects.owners.read`, `crm.schemas.contacts.read` (lectura de actividades/engagements vía asociaciones).
- **Propiedades exactas a leer:**

| Objeto | Propiedades | Para qué |
| --- | --- | --- |
| **Contact** | `email`, `firstname`, `lastname`, `company`, `jobtitle`, `hubspot_owner_id` (SDR), `lifecyclestage`, `hs_lead_status`, `hs_analytics_source` (original source), `utm_campaign` (**canónica** — ignorar `utm__campaign` / `utm_campaign_`), país | Atribución, regla MQL, dueño SDR |
| **Contact (Heat Score §H)** | `num_conversion_events`, `recent_conversion_date`, `recent_conversion_event_name`, `first_conversion_event_name`, `hs_email_last_open_date`, `hs_email_open`, `hs_email_click`, `hs_email_replied`, `hs_analytics_num_page_views`, `hs_email_optout`, `num_contacted_notes` | Señales de intención |
| **Deal** | `amount`, `amount_in_home_currency`, `dealstage`, `pipeline`, `createdate`, `closedate` + asociación a contacto/empresa | SQL, Pipeline €, Closed Won |
| **Company** | `name`, `domain`, `industry`, `country`, `hubspot_owner_id`, `is_target_abm` (propiedad custom a crear) | ABM |
| **Engagements** | meetings / notes / emails (timeline) | Account Timeline |

- **Definiciones de negocio (confirmadas en datos reales):**
  - **MQL** = `hs_lead_status` ∉ {`MK NOT QUALIFIED`, vacío}.
  - **SQL** = contacto con Deal de `amount > 0`.
  - **Closed Won** = deals con `dealstage` = Closed Won.
- **Dónde acaba:** tablas `contacts`, `deals`, `accounts`, `activities`, `heat_scores`.
- **Lo usa:** todo el funnel (Overview, Paid, Forecast), ABM y Heat Score.

## 4. Supabase — proyecto Postgres + Auth

- **Qué crear:** un proyecto Supabase. Aporta `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Migración inicial:** `supabase/migrations/0001_paid_core.sql` (modelo de datos paid). El resto del modelo (CRM/ABM) se añade en F1.
- **Decisión:** ¿lo creáis vosotros o nos dais acceso para crearlo?

## 5. Google Workspace — **SSO** (OIDC)

- **Qué crear:** un **OAuth client** en Google Cloud (consent screen del workspace de Dcycle). Aporta `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`.
- **Restricción de dominio:** solo cuentas `@dcycle.io` (y dominios que indiquéis).
- **Lo usa:** login de la app (toda persona entra por SSO; sin login local).

---

## 📍 Dónde pegar las credenciales

Todas van en **Netlify → site `dcycle-mkt-gtm-revenue-tracking-tool` (team Dcycle) → Environment variables**. Nunca en el repositorio. Plantilla completa de variables: [`.env.example`](../.env.example).

| Conector | Variables | Estado |
| --- | --- | --- |
| Supermetrics (LinkedIn + Google) | `SUPERMETRICS_API_KEY`, `SUPERMETRICS_TEAM_ID` | 🟡 falta token |
| HubSpot | `HUBSPOT_PRIVATE_APP_TOKEN` | 🔴 bloqueante |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | 🟡 por crear |
| Google SSO | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | 🟡 por crear |

> Conforme se rellenan, la pantalla **Data Health** y **Admin → Conexiones** pasan a "Conectado" y las cifras dejan de ser de ejemplo.
