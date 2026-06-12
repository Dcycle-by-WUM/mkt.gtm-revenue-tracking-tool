# 👀 Preview de la versión de prueba (sin desplegar)

Esta es una **vista del contenido real de la app** para revisar las pantallas
**sin necesidad de desplegar**. Los números salen de la misma librería de KPIs
(`lib/kpis.ts`, fórmulas del Brief §7.6) aplicada a un dataset de ejemplo
(`lib/mock-data.ts`) con naming real del brief §3.

> ⚠️ **Cifras ilustrativas** (datos de ejemplo) para validar pantallas, flujos y
> definiciones de KPI. Las reales aparecen al conectar Supermetrics + HubSpot.
> Para verlo interactivo: `npm install && npm run dev` → http://localhost:3000

---

## 1. Overview — "Cómo vamos"  ·  `/`

Funnel paid unificado (tarjetas North-star):

| Spend | Leads | MQL | SQL | Pipeline € | Closed Won | ROI | % MQL/Lead | % SQL/MQL |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 18.750 € | 523 | 329 | 56 | 303.000 € | 51.000 € | 1516 % | 62,9 % | 17 % |

---

## 2. Paid Media Performance  ·  `/paid`

Tabla **canal × campaña** con todas las métricas de §7.6. País por
**campaign group** en LinkedIn (regla de oro §7.3):

| Canal | Campaña | Grupo | País | Spend | Impr. | Clics | CTR | CPC | CPM | Leads | MQL | SQL | CPL | CPMQL | CPSQL | Pipeline € | Closed Won | ROI |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| LinkedIn | `esp_mensaje_españa_documento [mofu]` | INT_ESP_2026 | ES | 4820 € | 312.400 | 1980 | 0,6 % | 2 € | 15 € | 142 | 96 | 18 | 34 € | 50 € | 268 € | 84.000 € | 21.000 € | 1642,7 % |
| LinkedIn | `int_doc_uk_errores_tiermulti [mofu]` | INT_MULTI_UK_2026 | UK | 6100 € | 401.200 | 2210 | 0,6 % | 3 € | 15 € | 118 | 71 | 12 | 52 € | 86 € | 508 € | 96.000 € | 0 € | 1473,8 % |
| Google | `carbon-footprint-software-de` | — | DE | 3380 € | 88.900 | 3120 | 3,5 % | 1 € | 38 € | 88 | 52 | 9 | 38 € | 65 € | 376 € | 47.000 € | 12.000 € | 1290,5 % |
| Google | `lm_calculadora-hdc-2025-es` | — | ES | 2940 € | 71.200 | 2680 | 3,8 % | 1 € | 41 € | 134 | 88 | 14 | 22 € | 33 € | 210 € | 61.000 € | 18.000 € | 1974,8 % |
| Google | `alcance-3-con-ia` | — | Sin país / Multi | 1510 € | 39.800 | 1190 | 3 % | 1 € | 38 € | 41 | 22 | 3 | 37 € | 69 € | 503 € | 15.000 € | 0 € | 893,4 % |
| **Total** | | | | **18.750 €** | **913.500** | **11.180** | **1,2 %** | **2 €** | **21 €** | **523** | **329** | **56** | **36 €** | **57 €** | **335 €** | **303.000 €** | **51.000 €** | **1516 %** |

> Nótese `alcance-3-con-ia` cayendo en **"Sin país / Multi"** (fallback §7.3) y la
> campaña UK atribuida por **grupo** (`INT_MULTI_UK_2026`), no por el nombre.

---

## 3. Data Health  ·  `/data-health`

Estado real de cada fuente de ingesta:

| Fuente | Método | Estado | Detalle |
| --- | --- | --- | --- |
| LinkedIn Ads (LIA) | Supermetrics API | 🟡 Pendiente | Autenticado en Supermetrics; falta token de API en env. |
| Google Ads (AW) | Supermetrics API | 🟡 Pendiente | Autenticado en Supermetrics; falta token de API en env. |
| HubSpot (CRM) | API privada | 🔴 Bloqueado | Bloqueado: API key pendiente (§12.1). |
| Supabase (datos + auth) | Postgres + RLS | 🟡 Pendiente | Proyecto Supabase por crear. |

---

## 4. Resto de pantallas (stubs por fase)

Visibles en la navegación con su etiqueta de fase, para ver el alcance completo:

| Pantalla | Ruta | Fase |
| --- | --- | --- |
| Campaign Detail | `/campaign-detail` | F2 |
| Pipeline & Forecast | `/forecast` | F3 |
| Explorer (pivot) | `/explorer` | F2 |
| ABM — Cuentas | `/abm-accounts` | F4 |
| ABM — Heat Score | `/abm-heat` | F4 |
| Orgánico (SEO) + AEO | `/organic` | F5 |
| Admin / Settings | `/admin` | F2 |

---

> Para los detalles de cada pantalla y la lógica de negocio, ver
> [`docs/BRIEF.md`](BRIEF.md) y [`docs/RACIONAL.md`](RACIONAL.md).
