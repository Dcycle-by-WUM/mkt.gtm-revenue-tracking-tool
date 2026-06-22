# 🧾 Registro de decisiones de negocio

Estado de las decisiones abiertas del Brief §12 / Racional §K. Leyenda: ✅ cerrada · ⏳ pendiente (con dueño) · ⏸️ on hold.

| # | Decisión | Estado | Resolución / Dueño |
| --- | --- | --- | --- |
| 1 | **Regla MQL** | ✅ Cerrada | MQL = `Lead Status` **∉ {`MK NOT QUALIFIED`, vacío}**. `NEW` e `IN_SEQUENCE` **SÍ** cuentan como MQL. Solo quedan fuera `MK NOT QUALIFIED` y los vacíos. Implementada en `lib/hubspot.ts:deriveMql`. |
| 2 | **Atribución de país** | ✅ Cerrada (enfoque) | El motor **auto-deriva los casos evidentes** (`US`/`US [BOFU]`→US, `MEX_`→MX, `UK`/`INT_..._UK_...`→UK, `-es`/`-ESP`→ES, `-de`→DE, etc., en `lib/country.ts`). Lo que **no logre descifrar** se encola en **Data Health** para etiquetado manual. No hace falta una lista exhaustiva por adelantado. |
| 3 | **Cuentas ABM (`is_target_abm`)** | ⏳ Pendiente | Criterio final lo cierra **Paula**. La propiedad custom en HubSpot se crea cuando la app esté construida y conectada. Mientras tanto el modelo (`accounts.is_target_abm`) y la UI editable ya están en su sitio. |
| 4 | **Pesos del Heat Score** | ✅ Cerrada | Validado. Versión §H (señales × recencia, bandas 🔥/⚡/🌱/❄️). **Editable desde Admin** (`heat_weights` con versiones, persiste pesos + umbrales). |
| 5 | **LinkedIn Companies Engagement Report** (¿Supermetrics o CSV semanal?) | ⏳ Pendiente | Owners: **Davide y Cris**. Tabla `linkedin_company_engagement` con campo `source` ya soporta ambos modos. Alimenta el Heat Score. |
| 6 | **Herramienta SEO** (DA/rankings: Moz/Ahrefs/Semrush) | ⏸️ On hold | Owners: **Davide y Cris**. Tabla `domain_authority` + `keyword_rankings` con campo `provider` ya soporta los tres. Fase 5. |
| 7 | **Plataforma AI-visibility** (Profound/Peec/Otterly/Semrush AI) + prompts y competidores | ⏸️ On hold | Owners: **Davide y Cris**. Tabla `ai_visibility` con campo `platform` ya soporta cualquier proveedor. Fase 5. |
| 8 | **HubSpot API key** | ⏳ Pendiente | Se conecta una vez la app esté construida (decisión tomada 2026-06-22). Adaptador `lib/hubspot.ts` + cron `sync-crm.ts` ya escritos; arrancan en cuanto `HUBSPOT_PRIVATE_APP_TOKEN` esté en env. |
| 9 | **SSO Google Workspace** | ⏳ Pendiente | Se enchufa después de que la app esté en producción. Mientras tanto, **acceso abierto full-admin**. Login stub en `/login` con banner explicativo. |

## Estado de la implementación

Lo cerrado ya está en el comportamiento del código (referenciado arriba).
Lo pendiente (#3, #5, #8, #9) **no bloquea el arranque** de la app: el
modelo de datos y las pantallas están en su sitio para enchufar cada
fuente cuando llegue. Lo on hold (#6, #7) tiene tabla soporte para
cualquier herramienta sin tocar schema.
