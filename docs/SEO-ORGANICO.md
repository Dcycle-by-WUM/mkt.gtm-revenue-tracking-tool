# SEO orgánico orientado a demos — Auditoría + Plan

> **Estado:** Propuesta para desarrollo (pantalla `/organic`, fase F5).
> **Autora:** Cristina (Marketing/GTM). **Fecha:** 2026-06-24.
> **Para el equipo de desarrollo:** este documento es el alcance acordado para rediseñar la pantalla `/organic`. Las 4 vistas clave están marcadas con ★.

## Contexto

La pantalla `/organic` (`app/organic/page.tsx`) es hoy un **stub F5**: dos tablas estáticas de KPIs (`mockSeoKpis`, `mockAeoKpis` en `lib/mock-data.ts:201`) sin filtros, sin keywords, sin URLs, sin tracking de leads y sin conexión a fuentes. No mide nada accionable para gestionar SEO.

El objetivo es convertirla en el **panel de control de SEO orgánico orientado a demos**: saber qué keyword debe llevar a qué página transaccional, cuántas demos genera el orgánico, qué URLs posicionan mejor, y seguir el lead status de quien pide demo orgánica — todo contra un **objetivo editable**. Para que sea real hay que **conectar Google Search Console (GSC), Google Analytics 4 (GA4) y Bing Webmaster Tools (Bing WMT)** mediante **conectores nativos (API individual de cada canal)** + HubSpot para demos/lead status/pipeline.

---

## A. Qué medir (framework de control SEO para B2B SaaS)

Cuatro capas, de tráfico a negocio. Las **4 preguntas prioritarias** están marcadas ★.

**1. Visibilidad / adquisición** (fuente: GSC + Bing WMT + GA4)
- Tráfico orgánico **non-branded** (sesiones/clics, separando marca con `brand_keywords`).
- Impresiones, clics, CTR y **posición media** por query y por página.
- Keywords estratégicas en **Top 3 / Top 10** y su tendencia mes a mes.
- ★ **URLs mejor posicionadas**: ranking de páginas por posición media, clics e impresiones (GSC page-level + GA4 landing pages).
- Domain Authority (tendencia) — fuente externa a confirmar (Moz/Ahrefs/Semrush, §12); fuera de GSC/GA/Bing.

**2. Intención / conversión** (fuente: GSC query×page + GA4 eventos)
- ★ **Páginas transaccionales por keyword**: para cada keyword estratégica, cuál es la página de conversión objetivo (demo / pricing / producto) y **qué URL rankea realmente** → detecta el *gap* (¿rankea la página informacional en vez de la transaccional?).
- Clasificación de intención por keyword (informacional / transaccional / marca).
- Conversion rate por landing transaccional (sesiones orgánicas → demo).

**3. Negocio / pipeline** (fuente: GA4 evento demo + HubSpot)
- ★ **Demos orgánicas generadas**: nº de `demo_request` con sesión orgánica (GA4) cruzado con HubSpot (`original_source = ORGANIC_SEARCH` / `AI_REFERRALS`).
- ★ **Lead status de las demos orgánicas**: embudo NEW → MQL → SQL → Pipeline → Closed Won por contacto que pidió demo orgánica (HubSpot `hs_lead_status` + deals).
- Leads/MQL orgánicos, pipeline € y closed won atribuidos a orgánico.

**4. AEO / Bing** (ya contemplado en el brief, se mantiene)
- AI Visibility, AI Share of Voice (plataforma a confirmar, §12), Bing impresiones/clics/posición.

**Objetivo (target vs real):** **objetivo editable de demos orgánicas** por mes/país, con barra de cumplimiento real vs objetivo (mismo patrón que Forecast).

---

## B. Conexión a fuentes (conectores nativos: API individual por canal)

Cada canal se conecta por su **propia API nativa** (no Supermetrics): GSC, GA4 y Bing WMT con su OAuth/credencial individual; demos/lead status/pipeline por **HubSpot** (bloqueado por API key, §12). Esto da control directo sobre los campos, sin intermediario ni límites de un conector de terceros.

| Fuente | Conector nativo | Auth | Campos a leer | Alimenta |
| --- | --- | --- | --- | --- |
| **GSC** | Search Console API (`searchanalytics.query`) | OAuth 2.0 / service account Google | query, page, position, clicks, impressions, ctr (separar marca con lista `brand_keywords` propia) | URLs top, keyword→página, non-branded |
| **GA4** | GA4 Data API (`runReport`) | OAuth 2.0 / service account Google | landingPage, sessionSourceMedium (`organic`), eventName=`demo_request`, sessions, conversions | Demos orgánicas, conversion rate por landing |
| **Bing WMT** | Bing Webmaster Tools API | API key de Bing WMT | impressions, clicks, query, position | Bloque Bing/AEO |
| **HubSpot** | API privada (private app) | token de app privada (pendiente, §12) | `original_source`, `hs_lead_status`, `recent_conversion`, deals (`amount`, `dealstage`) | Demos confirmadas, lead status, pipeline € |

> **Nota de implementación:** un cliente/módulo por canal en `lib/` (p.ej. `lib/gsc.ts`, `lib/ga4.ts`, `lib/bing.ts`, `lib/hubspot.ts`), cada uno con su credencial en env vars propias de Netlify. El stub `lib/supermetrics.ts` **no se usa** para SEO.

La función de cruce es la misma "puerta de canal" que el paid: `original_source ∈ {ORGANIC_SEARCH, AI_REFERRALS}`. Mientras HubSpot siga bloqueado, el bloque de lead status/pipeline funciona con mock realista (igual que `mockHeatContacts`).

> El detalle operativo de conexión (scopes OAuth, credenciales y env vars por canal) va en `docs/CONEXIONES.md` — añadir ahí las filas de GSC/GA4/Bing con su API nativa.

---

## C. Modelo de datos (nuevo `lib/seo.ts` + mock en `lib/mock-data.ts`)

Crear **`lib/seo.ts`** (paralelo a `lib/heat.ts`) con tipos, helpers y constantes. Mock realista en `lib/mock-data.ts` para que el preview funcione ya.

```ts
// Intención de la keyword
export type Intent = "transactional" | "informational" | "branded";

// Una keyword estratégica con su página objetivo y su ranking real (GSC)
export type SeoKeyword = {
  keyword: string;
  intent: Intent;
  targetUrl: string;       // página transaccional QUE DEBERÍA rankear (demo/pricing/producto)
  rankingUrl: string;      // página que GSC dice que rankea de verdad
  position: number;        // posición media (GSC)
  clicks: number; impressions: number;
  organicDemos: number;    // demos atribuidas a esta keyword (GA4 + HubSpot)
  isBranded: boolean; isStrategic: boolean;
  country: string; month: string;
};
// gap: si rankingUrl !== targetUrl → la transaccional no captura la query.

// URL/landing con su rendimiento orgánico (GSC page + GA4)
export type SeoPage = {
  url: string; isTransactional: boolean;
  position: number; clicks: number; impressions: number;
  organicSessions: number; organicDemos: number;
  country: string; month: string;
};

// Solicitante de demo orgánica — base del tracking de lead status
export type OrganicDemoLead = {
  email: string; company: string;
  source: "ORGANIC_SEARCH" | "AI_REFERRALS";
  entryKeyword: string; landingPage: string;
  requestDate: string;            // ISO
  leadStatus: string;             // NEW | MQL | SQL | NURTURING | ... (mismos valores que heat.ts)
  isMql: boolean;
  dealAmount: number; dealStage: string;  // pipeline €
  ownerSdr: string; country: string; month: string;
};
```

Helpers en `lib/seo.ts`: `filterSeo(rows, {country, month})`, `topUrls(pages)`, `keywordGap(kw)` (`rankingUrl !== targetUrl`), `countOrganicDemos(leads, filters)`, `funnelByStatus(leads)`, `pipelineFromDemos(leads)`. Reutilizar formateadores de `lib/kpis.ts` (`fmtEur`, `fmtNum`, `fmtPct`). Constante `LEAD_STATUSES` con el orden del embudo.

Objetivo de demos orgánicas — añadir a `lib/mock-data.ts` junto a `mockForecast`:
```ts
export type OrganicDemoTarget = { month: string; country: string; targetDemos: number };
export const mockOrganicDemoTargets: OrganicDemoTarget[] = [ ... ];
export const ORGANIC_TARGET_KEY = "gtm.organicDemoTargets.v1"; // localStorage, patrón useLocalState
```

---

## D. Rediseño de la pantalla `/organic`

**Estructura: todo en `/organic` por secciones**, con filtros país/mes arriba. Consistente con cómo navega el equipo (una pantalla por tema) y permite cruzar las 4 vistas con los mismos filtros. El tracking de lead status va como sección destacada dentro de la misma pantalla.

Reescribir `app/organic/page.tsx` como client component (`"use client"`) con `useLocalState`, manteniendo `PageHeader` + `StatusBanner`. Secciones:

1. **Filtros** — `FilterBar` con `showChannel={false}` (`components/FilterBar.tsx`; país/mes ya soportados).
2. **KPIs cabecera** — tarjetas calculadas desde el mock (tráfico non-branded, keywords Top 3, demos orgánicas, pipeline SEO €) — sustituyen las tablas estáticas actuales.
3. ★ **Objetivo de demos orgánicas (target vs real)** — barra de cumplimiento por mes/país; objetivo editable (input numérico) persistido con `useLocalState(ORGANIC_TARGET_KEY)`, patrón idéntico al Forecast editable.
4. ★ **Páginas transaccionales por keyword** — tabla `keyword | intención | página objetivo | URL que rankea | posición | demos`, resaltando filas con *gap* (`rankingUrl !== targetUrl`).
5. ★ **URLs mejor posicionadas** — tabla ordenable por posición / clics / impresiones + demos por URL.
6. ★ **Lead status de demos orgánicas** — embudo por estado (reutilizar visual del embudo de `app/campaign-detail/page.tsx:100`) + tabla de contactos con **lead status editable** (select), persistido en localStorage (patrón de tags en campaign-detail).
7. **AEO + Bing** — mantener el bloque actual.

Reutilizar componentes existentes: `Panel`/`PageHeader` (`components/Page.tsx`), `FilterBar`, embudo de campaign-detail, formateadores de `kpis.ts`. No introducir librerías nuevas.

---

## Archivos a crear / modificar

- **Crear** `lib/seo.ts` — tipos (`SeoKeyword`, `SeoPage`, `OrganicDemoLead`, `Intent`), helpers y `LEAD_STATUSES`.
- **Modificar** `lib/mock-data.ts` — añadir mocks (`mockSeoKeywords`, `mockSeoPages`, `mockOrganicDemoLeads`, `mockOrganicDemoTargets`) y `ORGANIC_TARGET_KEY`. Mantener `mockSeoKpis`/`mockAeoKpis` o derivarlos.
- **Reescribir** `app/organic/page.tsx` — client component con las 7 secciones.
- **Modificar** `docs/CONEXIONES.md` y `docs/BRIEF.md` §10 — añadir filas de medición (keyword→página, demos orgánicas, lead status, target) y settings de GSC/GA4/Bing para SEO.

## Pasos de implementación

1. `lib/seo.ts` con tipos + helpers + `LEAD_STATUSES` (reusando `ChannelMetrics`/formateadores de `kpis.ts`).
2. Mocks realistas en `lib/mock-data.ts` (keywords con casos de *gap*, URLs top, ~6 leads con estados variados, targets por mes/país).
3. Reescribir `app/organic/page.tsx` sección a sección (filtros → KPIs → objetivo → keyword/página → URLs → lead status → AEO).
4. Cablear `useLocalState` para objetivo editable y lead status editable.
5. Actualizar docs (CONEXIONES/BRIEF) con el framework de medición y los settings de las 3 fuentes.

## Verificación

- `npm run build` y `npm run typecheck` sin errores (TS strict).
- `npm run dev` → `/organic`: filtros país/mes recalculan todas las secciones; editar el objetivo y un lead status persiste tras recargar (localStorage); las filas con *gap* keyword→página se resaltan; la tabla de URLs ordena.
- Confirmar que el embudo de lead status suma correctamente las demos orgánicas y el pipeline €.
- Deploy de rama en Netlify para revisión visual del equipo (branch deploy automático).
