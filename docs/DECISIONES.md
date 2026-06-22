# 🧾 Registro de decisiones de negocio

Estado de las decisiones abiertas del Brief §12 / Racional §K. Leyenda: ✅ cerrada · ⏳ pendiente (con dueño) · ⏸️ on hold.

| # | Decisión | Estado | Resolución / Dueño |
| --- | --- | --- | --- |
| 1 | **Regla MQL** | ✅ Cerrada | MQL = `Lead Status` **∉ {`MK NOT QUALIFIED`, vacío}**. `NEW` e `IN_SEQUENCE` **SÍ** cuentan como MQL. Solo quedan fuera `MK NOT QUALIFIED` y los vacíos. Implementada en `lib/hubspot.ts:deriveMql`. |
| 2 | **Atribución de país** | ✅ Cerrada (enfoque) | El motor **auto-deriva los casos evidentes** (`US`/`US [BOFU]`→US, `MEX_`→MX, `UK`/`INT_..._UK_...`→UK, `-es`/`-ESP`→ES, `-de`→DE, etc., en `lib/country.ts`). Lo que **no logre descifrar** se encola en **Data Health** para etiquetado manual. No hace falta una lista exhaustiva por adelantado. |
| 3 | **Cuentas ABM (`is_target_abm`)** | ⏳ Pendiente | Criterio final lo cierra **Paula**. La propiedad custom en HubSpot se crea cuando la app esté construida y conectada. Mientras tanto el modelo (`accounts.is_target_abm`) y la UI editable ya están en su sitio. |
| 4 | **Pesos del Heat Score** | ✅ Cerrada | Validado. Versión §H (señales × recencia, bandas 🔥/⚡/🌱/❄️). **Editable desde Admin** (`heat_weights` con versiones, persiste pesos + umbrales). Versión `default-2026Q3` sembrada en DB. |
| 5 | **LinkedIn Companies Engagement Report** (¿Supermetrics o CSV semanal?) | ⏳ Pendiente | Owners: **Davide y Cris**. Tabla `linkedin_company_engagement` con campo `source` ya soporta ambos modos. Alimenta el Heat Score. |
| 6 | **Herramienta SEO** (DA/rankings: Moz/Ahrefs/Semrush) | ⏸️ On hold | Owners: **Davide y Cris**. Tabla `domain_authority` + `keyword_rankings` con campo `provider` ya soporta los tres. Fase 5. |
| 7 | **Plataforma AI-visibility** (Profound/Peec/Otterly/Semrush AI) + prompts y competidores | ⏸️ On hold | Owners: **Davide y Cris**. Tabla `ai_visibility` con campo `platform` ya soporta cualquier proveedor. Fase 5. |
| 8 | **HubSpot API key** | ✅ Cerrada | Token configurado en Netlify env (Álvaro Granados, 22-jun). Cron `sync-crm.ts` arranca en el próximo deploy. |
| 9 | **SSO Google Workspace** | ⏳ Pendiente | Se enchufa después de que la app esté en producción. Mientras tanto, **acceso abierto full-admin**. Login stub en `/login` con banner explicativo. |
| 10 | **Supabase del proyecto** | ✅ Cerrada | Proyecto `cwcvurrkqwifpngzecxu` (org `ydxsdlwjuonbgvxmsihp`). 5 migraciones aplicadas (22 tablas + 2 vistas materializadas + función `refresh_kpi_views`). URL + anon key configuradas en Netlify env. ⚠️ **RLS desactivado en todas las tablas** (intencional hasta SSO; el deploy está protegido por contraseña de Netlify así que el anon key no es público). Service role key pendiente de pegar para que escrituras + crons funcionen. |

## Estado de la implementación

Lo cerrado ya está en el comportamiento del código (referenciado arriba).
Lo pendiente (#3, #5, #8, #9) **no bloquea el arranque** de la app: el
modelo de datos y las pantallas están en su sitio para enchufar cada
fuente cuando llegue. Lo on hold (#6, #7) tiene tabla soporte para
cualquier herramienta sin tocar schema.
