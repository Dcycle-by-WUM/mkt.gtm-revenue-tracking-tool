# 👀 Preview de la versión de prueba (sin desplegar)

Esta es una **vista del contenido real de la app** para revisar las pantallas
**sin necesidad de desplegar**. Los números salen de la misma librería de KPIs
(`lib/kpis.ts`, fórmulas del Brief §7.6) aplicada a un dataset de ejemplo
(`lib/mock-data.ts`) con naming real del brief §3.

> ⚠️ **Cifras ilustrativas** (datos de ejemplo) para validar pantallas, flujos y
> definiciones de KPI. Las reales aparecen al conectar Supermetrics + HubSpot.
> Para verlo interactivo: `npm install && npm run dev` → http://localhost:3000

## ✨ Interactividad (editable en el prototipo)

Ya **no es una maqueta estática**. En el prototipo puedes:

- **Filtrar por país / mes (y canal)** en Overview, Paid, Forecast y Explorer. Los datos abarcan 3 meses (2026-04 a 2026-06).
- **Overview**: tabla dinámica que se **recalcula sola** al cambiar agrupación (Canal / País / Campaña / Mes) y filtros.
- **Paid**: dejar una **nota de apuntes por campaña**.
- **Forecast**: **editar** objetivos y real, **añadir/borrar** filas por canal/país; el % de cumplimiento se actualiza solo.
- **Explorer**: ver las campañas **"Sin país / Multi"** y **asignarles país**; el override se aplica en todas las pantallas.
- **ABM — Cuentas**: filtrar por país/SDR y editar objetivo ABM, SDR y notas.

> Los cambios se guardan en el navegador (`localStorage`). En producción irán
> contra Supabase con autor/fecha (auditoría). Las tablas de abajo son un
> ejemplo del mes **2026-06**; con los filtros los números cambian.

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

## 4. Campaign Detail  ·  `/campaign-detail`  (F2)

Detalle de `esp_mensaje_españa_documento [mofu]` (grupo `INT_ESP_2026`, país ES, UTM matcheado exacto):
- **Spend timeline** semanal (gráfico de barras).
- **Embudo**: 142 Leads → 96 MQL → 18 SQL → 84.000 € pipeline → 21.000 € won. CPL 34 € · ROI 1642,7 %.
- Notas editables.

## 5. Pipeline & Forecast vs Objetivos  ·  `/forecast`  (F3)

Forecast manual vs real con pacing (🟢 ≥100 % · 🟡 85–99 % · 🔴 <85 %):

| Canal | Mes | País | Spend obj. | Spend real | Pipeline obj. | Pipeline real | % cumpl. |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LinkedIn | 2026-06 | ES | 5.000 € | 4.820 € | 90.000 € | 84.000 € | 🟡 93,3 % |
| LinkedIn | 2026-06 | UK | 6.500 € | 6.100 € | 110.000 € | 96.000 € | 🟡 87,3 % |
| Google | 2026-06 | ES | 3.000 € | 2.940 € | 55.000 € | 61.000 € | 🟢 110,9 % |
| Google | 2026-06 | DE | 4.000 € | 3.380 € | 60.000 € | 47.000 € | 🔴 78,3 % |

## 6. Explorer / pivot  ·  `/explorer`  (F2)

Tabla pivotable **interactiva** por Canal / País / Campaña (botones). Ejemplo pivotando por **País**:

| País | Spend | Leads | MQL | SQL | Pipeline € | ROI |
| --- | --- | --- | --- | --- | --- | --- |
| ES | 7.760 € | 276 | 184 | 32 | 145.000 € | 1768,6 % |
| UK | 6.100 € | 118 | 71 | 12 | 96.000 € | 1473,8 % |
| DE | 3.380 € | 88 | 52 | 9 | 47.000 € | 1290,5 % |
| Sin país / Multi | 1.510 € | 41 | 22 | 3 | 15.000 € | 893,4 % |

## 7. ABM — Cuentas  ·  `/abm-accounts`  (F4)

Cuentas-objetivo con Heat Score (= máximo de sus contactos), SDR e impacto de ads:

| Cuenta | País | SDR | ABM | Heat Score | Última actividad | Ads |
| --- | --- | --- | --- | --- | --- | --- |
| Acme Logistics | ES | Juanjo | 🎯 | 100 · 🔥 Caliente | 2026-06-11 | ✅ |
| Northwind Foods | UK | Paula | 🎯 | 96 · 🔥 Caliente | 2026-06-09 | ✅ |
| Helios Energy | DE | Juanjo | 🎯 | 36 · 🌱 Tibio | 2026-05-30 | — |
| Verde Retail | ES | Paula | — | 9 · ❄️ Frío | 2026-06-12 | ✅ |

## 8. ABM — Account Timeline  ·  `/abm-timeline`  (F4)

Línea temporal de **Acme Logistics**: 📣 impactada por LinkedIn Ads (15 may) → 📄 descargó Calculadora HdC (20 may) → ✉️ abrió secuencia (28 may) → 🌐 visitó /pricing (4 jun) → 🎥 webinar Alcance 3 (9 jun) → 🤝 solicitó demo (11 jun).

## 9. ABM — Heat Score / Señales de intención  ·  `/abm-heat`  (F4)

Ranking pre-demo con el **algoritmo §H** (señales × recencia) calculado en vivo, con desglose por señal. Ejemplo (Laura @ Acme): Conversiones≥5 +70, Demo +40, Email respondido +50, Opens +24, Clicks +20, Page views +16, LinkedIn +15 → **score 100 · 🔥**.

| Contacto | Empresa | Score | Banda |
| --- | --- | --- | --- |
| Laura (Head of Sustainability) | Acme Logistics | 100 | 🔥 Caliente |
| Mark (ESG Manager) | Northwind Foods | 96 | 🔥 Caliente |
| Sven (Operations Director) | Helios Energy | 36 | 🌱 Tibio |
| Ana (Marketing Lead) | Verde Retail | 9 | ❄️ Frío |

## 10. ABM — Overview por SDR  ·  `/abm-sdr`  (F4)

Cada SDR vs sus cuentas asignadas, con nº de cuentas y leads 🔥. (Juanjo: Acme, Helios · Paula: Northwind, Verde Retail.)

## 11. Orgánico (SEO) + AEO  ·  `/organic`  (F5)

KPIs SEO (tráfico non-branded, DA 47, 34 keywords Top 3, 61 MQL orgánicos, 72.000 € pipeline) y AEO (AI Visibility 23 %, Share of Voice 12 %, 14 leads desde IA, Bing), conectados a pipeline €.

## 12. Admin / Settings  ·  `/admin`  (F2)

Conexiones (estado por integración), roles SSO (Admin/Marketing/SDR/Solo-lectura), definiciones de negocio editables (regla MQL, país por grupo, pesos Heat Score) y overrides de país.

---

> Para los detalles de cada pantalla y la lógica de negocio, ver
> [`docs/BRIEF.md`](BRIEF.md) y [`docs/RACIONAL.md`](RACIONAL.md).
