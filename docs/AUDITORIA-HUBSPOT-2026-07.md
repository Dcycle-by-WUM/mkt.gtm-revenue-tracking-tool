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

## 3.5 Reconciliación con el tracker manual de Davide (10-jul)

Davide comparó su tracker manual (CSV "International Inbound / Paid Media
Tracker", que a pesar del nombre incluye Spain) con los números de §2.1 y no
cuadraban. Diff contacto a contacto (abril-mayo completo, por nombre):

| Mes 2026 | Tracker Davide | HubSpot inbound bruto | Tests @dcycle.io | HubSpot **limpio** |
| --- | ---: | ---: | ---: | ---: |
| Ene | 169 | 170 | 13 | **157** |
| Feb | 286 | 287 | 10 | **277** |
| Mar | 172 | 175 | 10 | **165** |
| Abr | 134 | 154 | 26 | **128** |
| May | 86 | 99 | 8 | **91**† |

† En mayo quedan además los 2 falsos externos (`pruebas@googads.com`,
`antonio@sinapellidos.com`, ambos MK NOT QUALIFIED) que el filtro por
dominio no cubre — al borrarlos a mano, mayo limpio = **89**.

MQL limpio (regla DECISIONES #1, sin tests): Ene **95** · Feb **215** ·
Mar **88** · Abr **73** · May **58**. (Los tests inflaban el MQL de abril
en 14: doce con lead status NEW y dos más, y el de mayo en 4.)

Cuatro causas, todas verificadas:

1. **Contactos de prueba internos** (la causa gorda). HubSpot tiene **83
   contactos "alba ortiz"** creados en 2026 con emails internos
   (`alba+*@dcycle.io`, `alba.ortiz+claude-e2e-*@dcycle.io`), más
   `paula.cons+test*`, `cristina.alcala-zamora.test*`, `real-demo-*` — pruebas
   de formularios/demos/E2E del equipo. Muchos entran con
   `lead_source=Inbound` (26 de los 154 de abril; 10 de los ~99 de mayo) y
   varios hasta con lead status MQL. El tracker de Davide también los
   arrastra pero en distinta cantidad (13 en abril, 6 en mayo, 14 en enero…),
   así que ambos lados estaban inflados de forma distinta. **Fix**: migración
   0019 + filtro en ingesta (`lib/hubspot.ts`) — un email `@dcycle.io` nunca
   es un lead. Quedan 2 falsos con dominio externo para borrar a mano en
   HubSpot: `pruebas@googads.com` y `antonio@sinapellidos.com` (29/30-may,
   MK NOT QUALIFIED).
2. **~20 contactos reales de finales de abril / primeros de mayo que faltan
   en el tracker** (29-abr a 9-may casi todos MK NOT QUALIFIED, más Adrian
   Gamboa MEETING 10-abr, Cynthia Lafuente 14-abr, Fernanda Jimena Alonso de
   Europastry MEETING 21-may). Consistente con un corte/exportación manual
   que no recogió la cola del mes.
3. **`lead_source` se rellena a posteriori**: p. ej. el contacto de SunExpress
   era Outbound hasta que lo corregimos hoy a Inbound — un snapshot manual
   congela lo que era verdad ese día; la query en vivo lo ve distinto.
4. **Zona horaria**: la API devuelve UTC; el tracker usa hora de Madrid.
   Taiwo Falope (31-may 23:33 UTC = 1-jun 01:33 CEST) cae en mayo para la
   API y en junio para el tracker.

La fila del tracker que no aparecía (Jaime Yrazusta, BBVA, "15-abr"):
localizado — el contacto existe (220207108626, lead_source Inbound, fuente
OFFLINE) pero se creó el **13-ene-2023**. El "15-abr-2026" del tracker es
una **re-conversión** (nuevo envío de formulario), no la creación del
contacto: no pertenece a la cohorte de contactos creados en 2026.

## 3.6 Reconciliación de PIPELINE con el tracker de Davide (10-jul, tarde)

Davide reporta que filtrando Spain + enero-2026 el pipeline de la plataforma
no se parece al suyo. Diff deal a deal de las **39 filas con importe** de su
tracker (36 deals únicos) contra los 433 deals reales de HubSpot:

### El caso concreto: enero 2026 · Spain

| Deal (tracker) | € | Qué hace la plataforma | Por qué |
| --- | ---: | --- | --- |
| CANPIPORK | 5.000 | ✅ Enero | Deal creado 26-ene, Direct Traffic, AE |
| Cox Energy | 15.000 | ➡️ **Febrero** | Contacto creado 29-ene pero el **deal** se creó el 9-feb — la plataforma atribuye por mes del deal (decisión 0013) |
| SOCOTEC | 11.200 | ❌ **Excluido** | El deal lo creó sales a mano el 30-abr (CRM_UI) → HubSpot le pone fuente **OFFLINE**, aunque el contacto (Felipe Barrena) es Paid Social/LinkedIn y MQL |

Tracker: **31.200 €** · Plataforma: **5.000 €**. Diferencia 100% explicada.

### Descomposición de los 36 deals únicos del tracker

| Tratamiento en la plataforma | Deals | Importe |
| --- | ---: | ---: |
| ✅ Incluido, mismo mes | 16 | 309.504 € |
| ➡️ Incluido, otro mes (mes del deal ≠ mes del contacto) | 10 | 201.700 € |
| ❌ Excluido: deal con fuente OFFLINE | 9 | 167.595 € |
| ❌ Excluido: pipeline DACH (RONAL Wheels) | 1 | 26.550 € |

### Causa 1 — grano: mes del contacto (tracker) vs mes del deal (plataforma)

El tracker cuelga el importe del mes en que se creó el **contacto**; la
plataforma, del mes del **deal** (decisión 0013, cerrada con Davide el
09-jul: es lo que hace comparable pipeline con esfuerzo comercial del mes).
Los deals suelen crearse 1–3 meses después del contacto (Dacsa: contacto
feb → deal abr; Martinrea: contacto mar → deal abr; Ubesol: contacto mar →
deal abr; Hortifrut: contacto mar → deal abr…). No es un error de nadie:
son dos convenciones distintas. La pantalla /deals muestra ambas fechas
(columna "Contacto creado") para poder cruzarlas.

### Causa 2 — deals creados a mano por sales heredan fuente OFFLINE ⚠️

**194.145 € en 10 deals** que el tracker considera inbound tienen en HubSpot
fuente OFFLINE porque el deal se creó por CRM_UI / IMPORT / integración — el
rollup de HubSpot ignora al contacto real que lo originó:

| Deal | € | Contacto origen (real) |
| --- | ---: | --- |
| SERVEO (60691196042) | 40.000 | Pilar Díaz (24-feb) |
| Grupo Aluman (58354250159) | 39.600 | Álvaro Porta (12-feb) |
| RONAL Wheels (60028458851) | 26.550 | Mario Blasco (27-may, Paid Social) — además está en pipeline DACH |
| Savills (61352544676) | 25.000 | Sergio de Jaime (10-jun) |
| Grupo Ubesol (58953474468) | 19.295 | Verónica Julián (2-mar) |
| SOCOTEC España (59963208257) | 11.200 | Felipe Barrena (13-ene, **Paid Social, MQL**) |
| Mitsubishi Electric (61024992796) | 9.000 | Sandra Arnáiz (11-may) |
| BARDINET (61776571232) | 9.000 | Dolors Cars (24-jun) |
| Informa D&B (59680291454) | 7.500 | Jesús Pillado (8-abr) |
| Talleres Mecánicos del Sur (56831853326) | 7.000 | Mario Fernández (19-feb) |

**Decisión (Davide, 10-jul): SÍ al fallback** — si el deal es OFFLINE pero
su contacto asociado es `lead_source=Inbound` explícito (y no interno
@dcycle.io), el deal cuenta como inbound con el canal del contacto; el mes
sigue siendo el del deal. Implementado en la migración 0020 (DECISIONES
#14); /deals marca estos deals con la etiqueta "vía contacto". RONAL Wheels
queda además condicionado a resolver su pipeline (está en DACH — pendiente
aclaración de Davide).

### Causa 3 — errores del propio tracker (a corregir en el Excel)

- **Filas duplicadas** que doblan importes: Cox Energy 2× (Spain + "To
  Assign Manually"), Serveo 2× (¡Spain y Mexico a la vez!), GTT 2× (marzo).
- **País**: M Moser figura como Spain en el tracker (es UK, campaña
  `ev_uk_report26`); Serveo como Mexico en una de sus filas (es Spain).
- SGK = deal "Propelis Group" (60.000, UK ✓); SWECO AB = deal "Brockton
  Everlast" (14.000, UK) — mismos deals con otro nombre de empresa.
- RONAL Wheels: el tracker lo cuenta como Spain pero el deal está en el
  **pipeline DACH** de HubSpot (contacto español de ronalgroup.com) —
  ¿deal mal ubicado en HubSpot o debe contar como DACH?

## 4. Qué queda pendiente de decidir

1. Confirmar los deals de §3.1/§3.2 (país/campaña/contacto) y aplicar los
   cambios en HubSpot.
2. ¿El pipeline DACH debe trackearse como región propia en la plataforma
   (con su spend)? Hoy queda fuera del scope de deals a propósito.
3. Las vistas KPI agregadas (Overview) siguen agrupando por país del deal;
   el caso "contacto DE en International Pipeline" (Exyte) se ve como DACH
   ahí (en /deals ya sale como Rest of International vía `business_region`).
   Si molesta, la siguiente iteración propaga `business_region` a las KPI.
4. Precedencia de contacto en deals con **varios contactos asociados** de
   canal distinto (ver §5, caso Stadler) — hoy la ingesta solo guarda 1
   contacto por deal y puede quedarse con el que no es el champion.

---

## 5. Canal «Otros» en Spain, feb-2026 — auditoría 20-jul

Pregunta de Davide: por qué "Otros" muestra un pipeline muy grande en
Spain en febrero 2026, con el caso concreto de **Stadler Rail AG - CSRD**
(sale como Otros cuando su champion, Nadya Segui, tiene Original Traffic
Source = Paid Search).

**Método**: igual que el §1 — se descargaron en vivo de la API de HubSpot
los **12 deals de AE Pipeline (`7888791` → Spain) creados en feb-2026**
(201.500 € en total), con el Original Traffic Source propio del deal Y
de **todos** sus contactos asociados (no solo el que guarda hoy la
plataforma). Ningún número de esta sección es estimado.

### 5.1 El caso Stadler, confirmado

Deal **Stadler Rail AG - CSRD** (56289624738) — 27.500 €, creado
16-feb-2026, Closed Lost, creado a mano en HubSpot (`CRM_UI`).
`hs_analytics_source` del deal = **OFFLINE**. Tiene **3 contactos
asociados**, no uno:

| Contacto | Rol | Creado | Original Traffic Source |
| --- | --- | --- | --- |
| Lino Mesa | HSE Manager | ago-2024 | OFFLINE |
| **Nadya Segui** | Técnica de Medioambiente (**champion**) | 17-feb-2026 | **Paid Search** |
| Blanca Gozálvez Rasero | Responsable de Medioambiente | 17-feb-2026 | Other Campaigns |

Nadya tiene razón: su Original Traffic Source es Paid Search. Dos causas
combinadas hacen que la plataforma no lo vea así:

1. **HubSpot ya "pierde" la señal al nivel del deal.** El campo
   `hs_analytics_source` de un deal se define (texto oficial de HubSpot)
   como *"original source for the contact with the earliest activity for
   this deal"* — coge el origen del contacto más **antiguo** asociado
   (Lino, 2024), no el del champion real ni el del contacto que originó
   la oportunidad de CSRD. Esto es comportamiento nativo de HubSpot, no
   de la plataforma.
2. **La plataforma solo guarda 1 contacto por deal.** `fetchDealAssociations`
   (`lib/hubspot.ts`) coge el primer contacto que devuelve la API de
   asociaciones de HubSpot (`r.to?.[0]?.id`) como único `hubspot_contact_id`
   del deal en Supabase. El fallback de la migración 0020 ("deal OFFLINE →
   mira el canal del contacto") depende de cuál contacto quedó guardado —
   con 3 contactos reales de canal distinto, puede acertar o fallar según
   el orden en que la API los devuelve. Aquí no acertó con Nadya.

El fallback de 0020 se diseñó pensando en 1 contacto por deal; en deals
multi-contacto (cuentas grandes / ABM, como Stadler) el resultado depende
de qué contacto ganó la carrera al guardar, no de cuál es el champion.

### 5.2 ¿Es un problema generalizado? Solo 1 de 12 deals

Se auditaron los 12 deals de Spain/feb-2026 (201.500 €) y **todos** sus
contactos asociados, buscando algún canal paid escondido en cada uno:

| Deal (id) | € | Estado | Fuente propia del deal | Contactos asociados (fuente) | ¿Champion paid oculto? |
| --- | ---: | --- | --- | --- | --- |
| Grifols S.A. (56162786407) | 56.000 | Abierto | OFFLINE | Darío Estrada (OFFLINE, lead feb-2024) | No |
| Lopesan (57030587652) | 33.000 | Cerrado perdido | OFFLINE | 3 contactos, todos OFFLINE | No |
| **Stadler Rail AG - CSRD** (56289624738) | 27.500 | Cerrado perdido | OFFLINE | Nadya (**Paid Search**), Blanca (Other Campaigns), Lino (OFFLINE) | **SÍ** |
| HIP (56162789932) | 25.000 | Abierto | OFFLINE | Francesc Esteve (OFFLINE, lead ene-2024) | No |
| Cox - Huella de Carbono (55759063730) | 15.000 | Cerrado perdido | Organic Search | Andrea (Organic Search), Elena (OFFLINE) | No |
| Cooperativa AIRA (56829278835) | 12.000 | Cerrado perdido | OFFLINE | Lupe Garcia (OFFLINE) | No |
| ABB Robotics Iberica (56127371161) | 8.000 | Cerrado ganado | OFFLINE | Laurent Menard (OFFLINE) | No |
| Talleres Mecánicos del Sur (56831853326) | 7.000 | Cerrado ganado | OFFLINE | Mario (Email Marketing), Ángeles (OFFLINE/Outbound) | No |
| GrupoNogar (55389459755) | 7.000 | Cerrado perdido | Organic Search | David (Organic Search), Jacobo (Other Campaigns) | No |
| Raventós Codorníu (55927481727) | 6.000 | Cerrado perdido | OFFLINE | Daniel García (OFFLINE, lead abr-2024) | No |
| Micropep (55688205187) | 2.500 | Cerrado ganado | OFFLINE | 3 contactos, todos OFFLINE | No |
| Verley Food - Ampliación (55688206373) | 2.500 | Cerrado ganado | Direct Traffic | Thibaut (Direct Traffic), Romain (OFFLINE) | No |

**11 de 12 deals (174.000 € de los 201.500 €) son "Otros" de verdad** —
ningún contacto asociado tiene canal paid. La mayoría son cuentas ya
existentes (leads históricos de 2024/2025 que abren una oportunidad
nueva en 2026, mismo patrón que §3.3) o inbound no-paid genuino
(orgánico, email marketing, direct). Esto es exactamente lo que "Otros"
está diseñado para capturar (ver comentario en `lib/mock-data.ts`) — no
hay bug ahí, y bastantes de estos deals ya están Cerrado perdido/ganado
(cuentan igual: el pipeline se mide por mes de creación del deal —
decisión 0013 — no por si sigue abierto).

### 5.3 Por qué "Otros" creció tanto en Spain/feb

No es un bug nuevo — es la migración 0020 (decisión #14, 10-jul) haciendo
su trabajo. Antes de esa migración, los 9 deals con fuente **OFFLINE**
(177.000 €) no contaban como inbound en absoluto — el audit de 9-jul
medía Spain/feb en **24.500 € / 3 deals** (§2.2), que son exactamente los
3 no-OFFLINE de la tabla de arriba (Cox, GrupoNogar, Verley). La 0020
amplió el scope para incluir OFFLINE-con-contacto-Inbound, correctamente
(esos 177K € son pipeline real generado por el equipo comercial, antes
invisible) — pero como casi ninguno tiene origen paid, aterrizan en
Otros en vez de LinkedIn/Google. El bucket creció porque ahora es más
completo, no porque esté mal.

**Nota de alcance**: esta sesión no ha podido consultar directamente la
base de Supabase de producción (`cwcvurrkqwifpngzecxu`) — el único
acceso disponible eran 2 proyectos personales inactivos, ninguno es el
de producción — así que el número exacto que ve Davide en el dashboard
puede diferir algo de los 201.500 €/174.000 € de arriba si el último
`sync-crm` no ha corrido después de ediciones recientes en HubSpot (todas
las fichas de esta sección se modificaron entre el 14 y el 20-jul, según
`hs_lastmodifieddate`). El mecanismo y el caso Stadler están verificados
100% contra la API de HubSpot en vivo; la reconciliación al euro exacto
del dashboard requiere acceso a esa base.

### 5.4 Qué hacer

**Corto plazo (HubSpot, manual)**: poner a Nadya Segui como contacto
primario del deal Stadler, o desasociar a Lino Mesa si ya no pinta nada
en la oportunidad de CSRD.

**Estructural (pendiente de decidir con Davide antes de tocar
`deal_attribution`, porque cambiaría números históricos de todos los
países/meses, no solo Spain/feb)**: la ingesta debería traer **todos**
los contactos asociados a un deal (no solo `r.to?.[0]`) y, al elegir cuál
atribuye canal, priorizar el que tenga `analytics_source` PAID_SOCIAL/
PAID_SEARCH sobre uno más antiguo pero no-paid — mismo espíritu que 0020
ya aplica (prioriza "contacto Inbound explícito" sobre "deal OFFLINE").

### 5.5 Barrido completo — los 128 deals de 2026 (AE + International)

Davide pidió extender el chequeo a **todo 2026**, no solo Spain/feb. Se
repitió el método a escala con un atajo: los deals tienen una propiedad
`num_associated_contacts` — un deal con **1 solo contacto** no puede tener
"el contacto equivocado" guardado (es el único que hay), así que solo
los deals con **2+ contactos** son candidatos al bug.

De los 128 deals de AE (`7888791`) + International (`727373069`) creados
en 2026: **66 tienen 2+ contactos**. De esos, 3 ya estaban bien
etiquetados como paid y 7 ya se habían revisado en el §5.2 (Stadler
corregido a mano por Davide tras esta auditoría). Los **56 restantes** se
auditaron contacto a contacto — mismo método, sin escribir nada en
HubSpot. Resultado: **3 mismatches más**, patrón idéntico a Stadler:

| Deal (id) | € | Fuente propia del deal | Contacto paid oculto | Canal real |
| --- | ---: | --- | --- | --- |
| Familia Torres - Huella de Carbono (61228877682) | 30.000 | OFFLINE | Manuel Fernández Gámez | Paid Search |
| Savills - ESG para clientes (61352544676) | 25.000 | OFFLINE | Sergio de Jaime Álvarez | Paid Social |
| Productos Solubles PROSOL - HdC + EINF (54835487140) | 8.750 | OFFLINE | Ana Izquierdo | Paid Social |

(Savills/Sergio de Jaime ya aparecía en el tracker de Davide del §3.6 sin
canal asignado — cuadra con el hallazgo.)

**63.750 € más** de pipeline mal atribuido — los otros 52 de los 56 son
Otros genuino, sin contacto paid escondido. Sumado a Stadler: **91.250 €**
confirmados con el patrón "contacto paid oculto entre varios asociados"
en todo 2026. Pendientes de corregir a mano en HubSpot (marcar el
contacto paid como primario / revisar asociaciones), igual que Stadler,
hasta que se decida el fix estructural del §5.4.

**Higiene aparte**: `[TEST] — Pricing Calculator Q2 2026` (60027752489,
31.300 €, OFFLINE, AE Pipeline) es un deal de prueba en producción —
mismo problema que "[TEST] E2E — Snoc" en §3.4. No tiene contacto paid
oculto, pero infla el pipeline igual; se recomienda borrarlo del portal.

### 5.6 Por qué "marcar a Nadya como primary contact" no basta — y qué se implementó

Davide intentó corregir Stadler a mano en HubSpot. Se volvió a comprobar
en vivo tras el intento: `hs_analytics_source` del deal seguía **OFFLINE**
y los 3 contactos seguían igual (mismo `lastmodifieddate`). Causa: ese
campo es un **rollup que calcula HubSpot** ("origen del contacto con la
actividad más antigua para este deal") — no mira si un contacto está
marcado "primary", así que esa acción no lo cambia. La app tampoco tiene
un override propio para canal (sí existe uno para país,
`country_overrides`, editable en Admin/Explorer) — hasta ahora HubSpot
era el único sitio donde tocar esto, y no de forma fiable.

**Implementado (este audit, 20-jul)**: migración
`0021_paid_contact_channel_any_associated.sql` + cambios en
`lib/hubspot.ts`. La ingesta ahora trae **todos** los contactos asociados
a cada deal (antes solo el primero que devolvía la API de HubSpot) y, si
cualquiera de ellos es `PAID_SOCIAL`/`PAID_SEARCH`, esa señal
(`deals.paid_contact_channel`) gana sobre el rollup de HubSpot y sobre el
fallback de un solo contacto de la migración 0020. Es un cambio
monótono: solo puede mover un deal DE Otros HACIA su canal paid real
cuando hay un contacto genuinamente paid asociado — nunca al revés, y
nunca quita atribución que ya fuera correcta.

Verificado: `npm run typecheck` y `npm run build` pasan limpio con el
cambio. **No verificado contra la base de producción** (esta sesión no
tiene acceso al proyecto Supabase `cwcvurrkqwifpngzecxu`, solo a 2
proyectos personales inactivos vía MCP) — falta:
1. Aplicar `supabase/migrations/0021_paid_contact_channel_any_associated.sql`
   contra producción (SQL editor de Supabase o `supabase db push`; no hay
   auto-deploy de migraciones en este repo).
2. Desplegar el cambio de `lib/hubspot.ts` (merge a main → deploy de
   Netlify).
3. Esperar al siguiente `sync-crm` (horario) o dispararlo a mano.

Una vez aplicado, Stadler + Familia Torres + Savills + PROSOL (91.250 €)
deberían salir de Otros automáticamente, sin tocar nada más en HubSpot —
y cualquier deal futuro con el mismo patrón (contacto paid tapado por
uno más antiguo no-paid) se resuelve solo, sin auditoría manual.

## 6. Nueva taxonomía de canal + exclusión de OFFLINE — 20-jul

Davide, tras el §5: "Otros" era un cajón de sastre inútil (mezclaba
orgánico, direct, email, offline, referrals, AI…). Decisión: desglosarlo
y, sobre todo, **sacar OFFLINE de la plataforma — la plataforma solo
trackea inbound**. Mapa nuevo Original Traffic Source → canal:

| Original Traffic Source (HubSpot) | Canal en la plataforma |
| --- | --- |
| Paid Social | LinkedIn |
| Paid Search | Google |
| Organic Search | **Organic** |
| Direct Traffic | **Organic** (decisión Davide) |
| Email Marketing | **Email Marketing** |
| Other Campaigns | Otros |
| AI Referrals | Otros |
| Organic Social / Referrals | Otros (Davide: "never used") |
| (sin etiqueta) | Otros (≠ Offline) |
| **Offline Sources** | **EXCLUIDO** |

**El matiz clave (OFFLINE vs decisión #14)**: "excluir OFFLINE" no puede
significar "tirar todo deal con fuente OFFLINE" — eso borraría Stadler,
que es OFFLINE a nivel de deal pero que Davide quiere ver como Paid
Search vía su champion. La exclusión es por **canal resuelto**, no por la
fuente cruda:

```
canal del deal = primer no-nulo de:
  1. paid_contact_channel            (0021: cualquier contacto asociado paid)
  2. source_to_channel(fuente del deal)     (null si OFFLINE)
  3. source_to_channel(fuente del contacto) (null si OFFLINE)
Si el resultado es NULL → deal EXCLUIDO.
```

Así: Stadler + los 3 del §5.5 entran (vía contacto paid); un deal OFFLINE
cuyo contacto es Organic/Email entra como Organic/Email; solo desaparecen
los deals OFFLINE de arriba a abajo (deal OFFLINE + contacto OFFLINE/sin
contacto). Esto **estrecha la decisión #14**: antes un deal OFFLINE con
`lead_source=Inbound` pero sin canal real se quedaba en Otros; ahora se
va. (Si Davide prefiere excluir TODO deal OFFLINE incluso con contacto de
canal real, es un cambio de una línea — pendiente de confirmar; hoy se
mantiene por ser la única lectura coherente con querer Stadler.)

Mismo criterio para **leads**: un contacto con Original Traffic Source =
OFFLINE deja de contar como lead. La vista de no-paid
(`kpi_organic_by_month`) pasa a desglosar `channel` (Organic / Email
Marketing / Otros) en vez de aplastar todo a "Otros".

**Implementado**: migración
`0022_channel_taxonomy_exclude_offline.sql` (función SQL
`source_to_channel` + `deal_attribution` + las 3 vistas KPI reescritas) y
código (`Channel` de 3→5 valores en `lib/mock-data.ts` +
`lib/supabase/types.ts`; Overview separa paid vs no-paid y muestra una
tabla por canal no-paid; helpers de país usan `isPaidChannel`).
`npm run typecheck` y `npm run build` pasan limpio. **No verificado
contra producción** (sin acceso a `cwcvurrkqwifpngzecxu` desde esta
sesión). Falta aplicar 0021 **y** 0022 en producción + desplegar el
código; efecto tras el siguiente `sync-crm`.

## 7. Regla final: el contacto de atribución debe predatar el deal — 20-jul

Davide, tras validar los 4 rescates: **"es clave que el contacto asociado
como inbound al deal se haya creado ANTES de que el deal existiera"**. Un
contacto creado después del deal no pudo originarlo. Es la lógica final
del tool y se aplica a TODOS los deals.

Verificado en vivo — fechas de creación de cada deal vs. su contacto paid:

| Deal | Deal creado | Contacto paid | Contacto creado | ¿Anterior? |
| --- | --- | --- | --- | --- |
| **Stadler Rail AG - CSRD** | 2026-02-16 | Nadya Segui (Paid Search) | 2026-02-17 | ❌ **+1 día después** |
| Familia Torres | 2026-06-18 | Manuel Fernández Gámez (Paid Search) | 2026-06-04 | ✅ 2 sem antes |
| Savills | 2026-06-23 | Sergio de Jaime (Paid Social) | 2026-06-10 | ✅ ~2 sem antes |
| PROSOL | 2026-01-28 | Ana Izquierdo (Paid Social) | 2025-11-03 | ✅ ~3 meses antes |

**El propio Stadler queda FUERA**: su champion Paid Search (Nadya) se creó
el día DESPUÉS de que sales creara el deal a mano (OFFLINE). Su único
contacto anterior al deal es Lino Mesa (OFFLINE, 2024). Por tanto Stadler
no tiene contacto inbound anterior → se excluye (era, en realidad, un deal
creado por sales con un toque paid posterior, no pipeline generado por
paid). Familia Torres, Savills y PROSOL se mantienen.

**Implementado**: `lib/hubspot.ts` (`contactPredatesDeal`) filtra
`paid_contact_channel` a contactos anteriores al deal; migración
`0023_contact_must_predate_deal.sql` añade el mismo gate al fallback por
contacto único de la vista (`ct.created_at_hs < d.createdate`). No se toca
la fuente propia del deal (limitación conocida: si HubSpot la derivó de un
contacto posterior, no se detecta). typecheck/build OK.

**Para producción** (además de aplicar 0023): deshacer el parche manual de
Stadler para que surta efecto sin esperar al sync —
`update deals set paid_contact_channel=null, paid_contact_id=null where
hubspot_deal_id='56289624738'; select refresh_kpi_views();`
