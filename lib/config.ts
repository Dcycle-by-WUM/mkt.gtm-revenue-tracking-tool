// Detección de integraciones configuradas. Permite que la app despliegue y
// funcione (con datos mock) aunque aún no estén los secretos, y que las
// pantallas muestren un aviso claro de qué falta conectar.

export const integrations = {
  supabase: Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  supermetrics: Boolean(process.env.SUPERMETRICS_API_KEY),
  googleSso: Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID),
  hubspot: Boolean(process.env.HUBSPOT_PRIVATE_APP_TOKEN),
};

export const anyDataSourceLive = integrations.supabase && integrations.supermetrics;
