# 🧾 Registro de decisiones de negocio

Estado de las decisiones abiertas del Brief §12 / Racional §K. Leyenda: ✅ cerrada · ⏳ pendiente (con dueño) · ⏸️ on hold.

| # | Decisión | Estado | Resolución / Dueño |
| --- | --- | --- | --- |
| 1 | **Regla MQL** | ✅ Cerrada | MQL = `Lead Status` **∉ {`MK NOT QUALIFIED`, vacío}**. `NEW` e `IN_SEQUENCE` **SÍ** cuentan como MQL. Solo quedan fuera `MK NOT QUALIFIED` y los vacíos. |
| 2 | **Atribución de país** | ✅ Cerrada (enfoque) | El motor **auto-deriva los casos evidentes** (`US`/`US [BOFU]`→US, `MEX_`→MX, `UK`/`INT_..._UK_...`→UK, `-es`/`-ESP`→ES, `-de`→DE, etc.). Lo que **no logre descifrar** se encola en **Data Health** para etiquetado manual (pide ayuda en vez de adivinar). No hace falta una lista exhaustiva por adelantado. |
| 3 | **Cuentas ABM (`is_target_abm`)** | ⏳ Pendiente | Criterio final lo cierra **Paula**. |
| 4 | **Pesos del Heat Score** | ✅ Cerrada | Validado. Versión §H (señales × recencia, bandas 🔥/⚡/🌱/❄️). Ajustable en Admin si hiciera falta. |
| 5 | **LinkedIn Companies Engagement Report** (¿Supermetrics o CSV semanal?) | ⏳ Pendiente | Owners: **Davide y Cris**. Alimenta el Heat Score. |
| 6 | **Herramienta SEO** (DA/rankings: Moz/Ahrefs/Semrush) | ⏸️ On hold | Owners: **Davide y Cris**. Fase 5. |
| 7 | **Plataforma AI-visibility** (Profound/Peec/Otterly/Semrush AI) + prompts y competidores | ⏸️ On hold | Owners: **Davide y Cris**. Fase 5. |

> Las decisiones cerradas (1, 2, 4) ya están reflejadas en el comportamiento del prototipo / la lógica documentada. Las pendientes/on hold no bloquean el arranque del camino paid (F1).
