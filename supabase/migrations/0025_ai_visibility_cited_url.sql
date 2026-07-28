-- Añade la URL citada por el motor de IA en su respuesta a `ai_visibility`.
-- Hasta ahora solo se guardaba SI Dcycle aparecía (`appeared`) y su posición
-- dentro de la respuesta (`rank_in_answer`), pero no QUÉ URL concreta citó
-- el motor — dato clave para el banco de "prompts → cita" que prioriza
-- Microsoft Copilot (motor que usa la mayoría de clientes Dcycle; se nutre
-- del índice de Bing). Columna nullable y aditiva: no rompe filas existentes
-- ni el resto de queries sobre esta tabla.

alter table ai_visibility add column if not exists cited_url text;
