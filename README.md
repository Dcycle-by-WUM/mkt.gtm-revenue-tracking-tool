# mkt.gtm-revenue-tracking-tool

Herramienta de tracking de Marketing/GTM que **unifica el gasto de paid media** (LinkedIn Ads + Google Ads) **con los resultados del CRM** (HubSpot), y amplía a **orgánico/SEO + AEO**. El pegamento entre ambos mundos es el `utm_campaign`.

## Qué resuelve
- Control de inversión paid: coste real vs resultado generado, por canal/campaña/país/mes.
- Embudo Lead → MQL → SQL → Pipeline € → Closed Won, atribuido por canal y campaña.
- Forecast vs objetivos con alertas de desvío.
- ABM: timeline por cuenta, señales de intención (**Heat Score**) y overview por SDR.
- SEO + AEO: tráfico non-branded, Domain Authority, keywords en Top 3, y visibilidad en motores de respuesta IA (AI Visibility / Share of Voice), conectados a pipeline €.

## Stack
- **Frontend + API:** Next.js (App Router) en **Netlify**.
- **Datos + Auth:** **Supabase** (Postgres + RLS; SSO **Google Workspace**) — proyecto `cwcvurrkqwifpngzecxu`.
- **Ingesta:** **Supermetrics API** (LinkedIn Ads, Google Ads, GSC/Bing/GA) + **HubSpot API**. Jobs en Netlify Scheduled Functions (`netlify/functions/`).

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # rellenar con los secretos cuando estén disponibles
npm run dev                  # http://localhost:3000
npm run build                # build de producción (lo que ejecuta Netlify)
```

La app **arranca y despliega sin secretos**, mostrando datos de ejemplo y
un aviso de qué falta conectar. Las cifras reales aparecen al configurar
las env vars (ver `.env.example`).

## Deploy (Netlify)

- Proyecto **`dcycle-mkt-gtm-revenue-tracking-tool`** (team **Dcycle**, Pro), con
  protección por contraseña activada para todos los deploys.
- `main` → URL de producción. Cada rama genera su **branch deploy** propio para
  revisión de Ops sin tocar `main`.
- Secretos en **env vars de Netlify** (nunca en el repo): Supabase
  (anon + service role), Supermetrics, Google OAuth, HubSpot.

### Scheduled Functions (ingesta)

| Función | Schedule | Qué hace |
|---|---|---|
| `netlify/functions/sync-paid.ts` | `@daily` | Supermetrics → `ad_spend_daily` (LinkedIn por **grupo** + Google), ventana de 14 días, refresca vistas KPI |
| `netlify/functions/sync-crm.ts` | `@hourly` | HubSpot → contacts/deals/companies/activities; idempotente por `hubspot_*_id` |
| `netlify/functions/compute-heat.ts` | cada 2h | Recalcula `heat_scores` con pesos activos + LinkedIn Companies Engagement |

## Estado del código

- **F0 — Scaffolding** ✅ Next.js + Netlify + CI + despliegue continuo.
- **F1 — Ingesta + motor** ✅ código: matching UTM↔campaña en cascada (`lib/matching.ts`), atribución de país (`lib/country.ts`), adaptadores Supermetrics + HubSpot, Scheduled Functions. **Pendiente:** credenciales en env vars de Netlify para que arranquen.
- **F2 — Core analytics** ✅ 13 pantallas live conectadas a la capa de datos (`lib/data/*`) con fallback a mock cuando Supabase no está vivo.
- **F3 — Objetivos + Notas** ✅ persistidos en Supabase con autor/fecha vía Server Actions.
- **F4 — ABM** ✅ Cuentas, Timeline, Heat Score, SDR. Algoritmo Heat editable desde Admin (versiones en `heat_weights`).
- **F5 — Orgánico (SEO) + AEO** ✅ modelo + pantalla; herramienta concreta (DA / AI-visibility) on hold en `DECISIONES.md`.

### Qué falta para "vivo de verdad"
1. **API key de HubSpot** → desbloquea CRM (contacts/deals/companies + Heat).
2. **`SUPERMETRICS_API_KEY` + `SUPERMETRICS_TEAM_ID`** → desbloquea paid (sync-paid empieza a poblar `ad_spend_daily`).
3. **`SUPABASE_SERVICE_ROLE_KEY` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`** → desbloquea persistencia (notas, forecast, overrides, tags). Las migraciones ya están en `supabase/migrations/0001…0005`.
4. **`GOOGLE_OAUTH_CLIENT_ID/SECRET`** → activa SSO Google Workspace (mientras tanto, acceso abierto).
5. **Cuentas ABM (`is_target_abm`)**: propiedad custom a crear en HubSpot (criterio cierra Paula).

## Documentación
- 📦 **[PRD (documento canónico)](docs/PRD.md)** — qué hace, con qué se conecta, qué lee de cada fuente, pantallas y **estado real del código**.
- 🔌 **[Guía de conexiones (Ops/IT)](docs/CONEXIONES.md)** — qué conectar, con qué credenciales, qué campos exactos y dónde acaba cada dato. Runbook de setup.
- 🧾 **[Registro de decisiones](docs/DECISIONES.md)** — estado de las decisiones de negocio.
- 👀 **[Preview de las pantallas](docs/PREVIEW.md)** — contenido de las 13 pantallas sin desplegar.
- 📄 **[Brief funcional + técnico](docs/BRIEF.md)** — base para el PRD.
- 🧠 **[Racional refinado v2](docs/RACIONAL.md)** — decisiones cerradas y hallazgos validados con datos reales.

## Estructura del repo

```
app/                    Next.js App Router (1 page.tsx por pantalla + *-client.tsx interactivos)
  actions.ts            Server Actions para escrituras (Supabase)
components/             Componentes compartidos (FilterBar, PivotTable, StatusBanner, Page)
lib/
  data/                 Fachada de lectura por dominio (Supabase con fallback a mock)
  supabase/             Cliente anon + admin + tipos del schema
  kpis.ts               Fórmulas de negocio (CTR/CPC/CPM/CPL/CPMQL/CPSQL/ROI/%)
  heat.ts               Algoritmo Heat Score (señales × recencia, bandas)
  matching.ts           Normalización UTM + matching en cascada
  country.ts            Atribución de país (LinkedIn por grupo / Google por sufijo / overrides)
  supermetrics.ts       Adaptador Supermetrics (LIA + AW)
  hubspot.ts            Adaptador HubSpot Private App
  mock-data.ts          Dataset de ejemplo (fallback cuando Supabase no está vivo)
netlify/functions/      Scheduled Functions de ingesta
supabase/migrations/    Schema versionado (5 migraciones)
```
