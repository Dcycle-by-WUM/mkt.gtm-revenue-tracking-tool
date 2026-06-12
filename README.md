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
- **Datos + Auth:** **Supabase** (Postgres + RLS; SSO **Google Workspace**).
- **Ingesta:** **Supermetrics API** (LinkedIn Ads, Google Ads, GSC/Bing/GA) + **HubSpot API**. Jobs en Netlify Scheduled Functions / Supabase.

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # rellenar con los secretos cuando estén disponibles
npm run dev                  # http://localhost:3000
npm run build                # build de producción (lo que ejecuta Netlify)
```

La app **arranca y despliega sin secretos**, mostrando datos de ejemplo y un
aviso de qué falta conectar. Las cifras reales aparecen al configurar las env
vars (ver `.env.example`).

## Deploy (Netlify)

- Proyecto **`dcycle-mkt-gtm-revenue-tracking-tool`** (team **Dcycle**, Pro), con
  protección por contraseña activada para todos los deploys.
- `main` → URL de producción. Cada rama genera su **branch deploy** propio para
  revisión de Ops sin tocar `main`.
- Secretos en **env vars de Netlify** (nunca en el repo): Supabase, Supermetrics,
  Google OAuth. HubSpot bloqueado hasta tener API key (§12.1 del brief).

## Estado del código

- **F0 (scaffolding):** ✅ Next.js + Netlify + navegación de las 13 pantallas + CI.
- **Camino paid:** modelo de datos (`supabase/migrations/0001_paid_core.sql`),
  librería de KPIs (`lib/kpis.ts`) y esqueleto de ingesta Supermetrics
  (`lib/supermetrics.ts`), pendientes de credenciales para datos reales.
- **Pantallas live:** Overview, Paid Media Performance, Data Health (con datos
  de ejemplo). El resto son stubs marcados por fase.

## Documentación
- 🔌 **[Guía de conexiones (Ops/IT)](docs/CONEXIONES.md)** — qué conectar, con qué credenciales, qué campos exactos (HubSpot/Supermetrics) y dónde acaba cada dato. **Runbook de setup.**
- 👀 **[Preview de las pantallas](docs/PREVIEW.md)** — contenido de las 13 pantallas sin desplegar.
- 📄 **[Brief funcional + técnico](docs/BRIEF.md)** — qué hace, modelo de datos, motor de cruce de KPIs, pantallas, ABM/Heat Score, SEO/AEO, roadmap y decisiones abiertas. (Base para el PRD.)
- 🧠 **[Racional refinado v2](docs/RACIONAL.md)** — decisiones cerradas y hallazgos validados con datos reales.
