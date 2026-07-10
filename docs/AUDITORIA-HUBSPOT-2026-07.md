# 🔍 Auditoría HubSpot ↔ plataforma — 9-jul-2026

Auditoría solicitada por Davide: verificar que los números de HubSpot en la
plataforma (deals, pipeline, MQL, SQL) cuadran con el CRM real. Paid Media
Spend ya estaba verificado como correcto; esto cubre el lado CRM.

**Método**: se descargaron los **433 deals creados en 2026** del portal
(20392666) con pipeline, stage, Original Traffic Source, importe y flags de
cierre, más el contacto asociado de cada deal abierto de AE Pipeline e
International Pipeline, y los contadores de contactos inbound 2026. Ningún
número de este documento es estimado; todos salen de la API de HubSpot.

**Reglas de negocio aplicadas** (las de Davide):
- Inbound = deal creado en 2026 con Original Traffic Source ≠ Offline Sources.
- AE Pipeline (`7888791`) → **Spain**.
- International Pipeline (`727373069`) → **Rest of International**; el país
  concreto se deduce de la campaña (o del contacto).

---

## 1. Errores encontrados en la plataforma (corregidos en la migración 0017)

### 1.1 Sobre-conteo de pipeline inbound: **+795.203 € / 85 deals**

`deal_attribution` incluía **todos** los pipelines de HubSpot (solo excluía
fuente OFFLINE). En 2026 eso mete como "inbound":

| Pipeline (no inbound) | Deals | Importe |
| --- | ---: | ---: |
| M&A | 2 | 200.000 € |
| Renewals | 36 | 179.924 € |
| Upsells & Cross-Sells | 17 | 146.264 € |
| Consulting license | 14 | 142.700 € |
| DACH Pipeline | 12 | 123.315 € |
| Alliance partnerships | 3 | 2.000 € |
| DACH Renewals | 1 | 1.000 € |
| **Total** | **85** | **795.203 €** |

(Las renovaciones/upsells heredan la cookie del contacto — p. ej. "Hochland -
Renovación 2026" salía como pipeline de LinkedIn paid.) Además 14 deals de
DACH/M&A **sin** Original Traffic Source colaban por el `coalesce(src,'')`.

**Fix**: el scope de deals pasa a ser `pipeline_country_map` (hoy AE +
International; añadir una fila incluye otro pipeline).

### 1.2 Closed Won siempre 0 €

La vista detectaba ganado con `dealstage = 'closedwon'`, pero este portal usa
**IDs numéricos de stage** ('22516636' = Closed won del AE Pipeline, etc.).
**0 de los 116 deals ganados** creados en 2026 casan con ese literal.

**Fix**: se ingieren `hs_is_closed_won` y `hs_is_closed` (flags que calcula
HubSpot) y la vista los usa. Real verificado: 6 deals inbound AE+International
ganados en 2026 = **66.275 €** (Verley 2.500, Ukio 6.900, Grupo Riza 10.800,
GTT 11.200, bonÀrea 30.000, VEGA 4.875).

### 1.3 International sin país → fuera de "Rest of International"

Deals de International Pipeline sin campaña matcheada y con contacto sin país
(o sin contacto) caían en 'Sin país / Multi', que es su propio bucket **fuera
de toda región** — desaparecían del filtro Rest of International (Hovis 30K,
FHCS 30K, Gavazzi 11K, SunExpress 25K†, Dunelm 30K, Grupo Pinsa 30K, Brockton
14K…). † SunExpress/Exyte tenían país DE del contacto → caían en **DACH**.

**Fix**: fallback de país `INTL` (agrupado en Rest of International) y columna
`business_region` por pipeline (AE → Spain, International → Rest of
International) que manda al filtrar por región en /deals — un contacto alemán
en International Pipeline no es DACH.

### 1.4 MQL: los vacíos contaban

`deriveMql` contaba `hs_lead_status` vacío como MQL; DECISIONES #1 (cerrada)
dice que los vacíos NO cuentan. Impacto: 8 de 1.066 inbound 2026. Corregido.

---

## 2. Números de referencia verificados (HubSpot, 9-jul-2026)

### 2.1 Leads / MQL inbound (contactos `lead_source = Inbound` creados 2026)

| Mes | Leads | MK NOT QUALIFIED | Sin lead status | **MQL** |
| --- | ---: | ---: | ---: | ---: |
| Ene | 170 | 71 | 3 | **96** |
| Feb | 287 | 70 | 2 | **215** |
| Mar | 175 | 84 | 3 | **88** |
| Abr | 154 | 67 | 0 | **87** |
| May | 98 | 36 | 0 | **62** |
| Jun | 120 | 36 | 0 | **84** |
| Jul (1–9) | 62 | 22 | 0 | **40** |
| **Total** | **1.066** | **386** | **8** | **672** |

### 2.2 Deals inbound (fuente ≠ Offline, AE + International, creados 2026)

| Mes | Spain (AE) deals | Spain € | Rest of Intl deals | Rest of Intl € |
| --- | ---: | ---: | ---: | ---: |
| Ene | 1 | 5.000 | 2 | 112.729 |
| Feb | 3 | 24.500 | 2 | 70.000 |
| Mar | 9 | 96.500 | 6 | 140.000 |
| Abr | 4 | 68.200 | 3 | 36.000 |
| May | 7 | 107.375 | 2 | 35.000 |
| Jun | 7 | 131.303 | 2 | 80.000 |
| Jul (1–9) | 5 | 115.950 | 1 | 11.000 |
| **Total** | **36** | **548.828 €** | **18** | **484.729 €** |

SQL (= deal con importe > 0): igual que "deals" salvo marzo Spain (8 — el
deal de Glenmark tiene 0 €). Con la lógica anterior la plataforma contaba
**1.828.760 €** de pipeline 2026 en vez de **1.033.557 €**.

---

## 3. Deals flageados — requieren acción o aclaración en HubSpot

La sesión no escribe en HubSpot sin confirmación; estos cambios hay que
hacerlos en el CRM (o confirmar y se automatizan).

### 3.1 International Pipeline — abiertos

| Deal (id) | Importe | Problema | Acción propuesta |
| --- | ---: | --- | --- |
| Hovis - CF, SBTi & decarb (61040566617) | 30.000 | Paid Social sin campaña; contacto (hovis.co.uk) **sin país** | Poner país United Kingdom al contacto; recuperar campaña |
| Gavazzi Tessuti Tecnici (62115588725) | 11.000 | **Sin contacto asociado** al deal | Asociar contacto; país probable Italia (por nombre — confirmar) |
| Exyte - CF (61024805273) | 50.000 | Paid Social sin campaña (deal y contacto); contacto Germany | Confirmar campaña LinkedIn de origen; región ya forzada a Rest of Intl |
| SunExpress (60708762880) | 25.000 | Contacto es **Outbound**; fuente del deal OTHER_CAMPAIGNS vacía | ¿Es inbound de verdad? Confirmar |
| M Moser (58208783442) | 25.000 | Campaña dice **UK** (`ev_uk_report26`), país del contacto dice **United States** | Confirmar país (regla: manda la campaña → UK) |
| FHCS / Freudenberg (57939146583) | 30.000 | Origen webinar en castellano (`webinar-doble-materialidad`, "ae / referral"), contacto de feb-2025 sin país | Confirmar país y que pertenece a International |
| Vantage Chemicals (53946452352) | 52.729 | ✅ Correcto: US (UTM "usa & uk" + país contacto) | — |
| Micromatic (59157127978) | 12.000 | ✅ Correcto: Lituania → Rest of Intl | — |

### 3.2 International Pipeline — cerrados 2026 (siguen sumando al mes de creación)

| Deal (id) | Importe | Problema | Acción propuesta |
| --- | ---: | --- | --- |
| Dunelm - LCAs (57939057236) | 30.000 | Contacto sin país (empresa UK) | País United Kingdom al contacto |
| Grupo Pinsa (58295679651) | 30.000 | Contactos sin país (pinsa.com = México); 1º contacto asociado es Outbound/Offline de 2025 | País Mexico a los contactos |
| Brockton Everlast (59186346357) | 14.000 | **Sin contacto asociado** | Asociar contacto |
| Williams Medical (57553795696) | 15.000 | Contacto con país **United States** siendo empresa UK (wms.co.uk) | Corregir a United Kingdom |
| Loreal - LCAs tool (55433805385) | 60.000 | El 1º contacto asociado no tiene país y es Offline; otro contacto sí tiene France | País France al contacto principal |

### 3.3 AE Pipeline — abiertos con contacto ANTERIOR a 2026 (check B)

Cuentan en el pipeline 2026 por fecha del deal (regla 0013, correcta), pero
son cosecha de leads antiguos — en /deals salen como cohorte "Lead histórico":

| Deal (id) | Importe | Contacto creado |
| --- | ---: | --- |
| Grupo Tragsa (61873380251) | 50.000 | oct/nov-2025 (webinar Alcance 3) |
| FCC Construcción (60638787405) | 40.000 | mar-2025 (webinar CSRD feb/25) |
| Vicky Foods (62112254386) | 34.000 | mixto: may-2026 + contactos 2024 |
| Pamesa Cerámica (62066959732) | 30.000 | feb-2025 |
| GSD (60839547756) | 22.000 | feb-2025 (champion) + 2 de jun-2026 |
| Hotusa (61041961905) | 17.000 | jun-2025 |
| CORTIZO (58332236041) | 12.000 | mar-2024 |
| COVAP (60177646762) | 8.500 | abr-2024 |
| Tradivel (62121965627) | 8.500 | dic-2023 · ⚠️ deal creado a mano (CRM_UI) y contacto Offline/newsletter — dudoso como inbound, confirmar |
| Colegio Brains (61292763504) | 4.803 | may-2023 |

El resto de AE abiertos (Dacsa, Martinrea, IAG7, Enrique Tomás, Acciona Agua,
Moove Cars, LAMIGRAF, Pont Aurell, ALCION, CHG, Talleres Zitrón, ROS ROCA)
tienen contacto 2026 coherente con su fuente. ✅

### 3.4 Higiene del portal

- **Deal de prueba en producción**: "[TEST] E2E — Snoc (MOG / Álvaro)"
  (61968367127, 28.350 €, sin pipeline, Offline). No entra en métricas, pero
  conviene borrarlo del portal.
- **27 contactos** creados en 2026 con `lead_source = Inbound` pero Original
  Traffic Source = Offline Sources (contradicción; ej. 229709053502).
- **Deloitte - New Deal** (62115588910): fuente Organic Social + webinar
  `webinar-ppwr-cumplimiento-espana`, pero está en Alliance partnerships →
  excluido de métricas por scope. Si debe contar como inbound Spain, está en
  el pipeline equivocado.
- 45.043 de los 46.115 contactos creados en 2026 no tienen `lead_source` —
  el filtro de ingesta (`lead_source = Inbound`) sigue siendo imprescindible.

---

## 4. Qué queda pendiente de decidir

1. Confirmar los deals de §3.1/§3.2 (país/campaña/contacto) y aplicar los
   cambios en HubSpot.
2. ¿El pipeline DACH debe trackearse como región propia en la plataforma
   (con su spend)? Hoy queda fuera del scope de deals a propósito.
3. Las vistas KPI agregadas (Overview) siguen agrupando por país del deal;
   el caso "contacto DE en International Pipeline" (Exyte) se ve como DACH
   ahí (en /deals ya sale como Rest of International vía `business_region`).
   Si molesta, la siguiente iteración propaga `business_region` a las KPI.
