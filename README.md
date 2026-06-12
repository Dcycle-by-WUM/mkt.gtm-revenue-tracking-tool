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

## Documentación
- 📄 **[Brief funcional + técnico](docs/BRIEF.md)** — qué hace, modelo de datos, motor de cruce de KPIs, pantallas, ABM/Heat Score, SEO/AEO, roadmap y decisiones abiertas. (Base para el PRD.)

> Estado: fase de definición. Próximo paso: convertir el brief en PRD y arrancar F0 (scaffolding).
