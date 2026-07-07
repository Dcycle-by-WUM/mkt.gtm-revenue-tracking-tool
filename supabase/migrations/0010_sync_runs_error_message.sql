-- La carga de LinkedIn Ads ahora corre como Background Function (ver
-- netlify/functions/upload-linkedin-ads-background.ts): el navegador no
-- recibe la respuesta HTTP real, así que hace polling contra `sync_runs`
-- para saber cuándo terminó y si falló. Sin esta columna, un status='error'
-- no dice por qué — hace falta para que el polling pueda mostrar algo útil.

alter table sync_runs add column if not exists error_message text;
