// Detección de qué integraciones tienen credenciales en el entorno.
// La app despliega y funciona aunque falte cualquiera (fallback a mock); los
// banners y la pantalla Data Health usan estos flags para avisar.

const has = (v: string | undefined): boolean => Boolean(v && v.length > 0);

export const integrations = {
  // Para considerar Supabase "vivo" no basta con la URL pública; necesitamos
  // la anon key (lecturas) o la service role (jobs).
  supabase: has(process.env.NEXT_PUBLIC_SUPABASE_URL) && has(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  supabaseAdmin: has(process.env.SUPABASE_SERVICE_ROLE_KEY),
  supermetrics: has(process.env.SUPERMETRICS_API_KEY),
  googleSso: has(process.env.GOOGLE_OAUTH_CLIENT_ID),
  hubspot: has(process.env.HUBSPOT_PRIVATE_APP_TOKEN),
  forceMock: process.env.FORCE_MOCK === "true",
};

export const dataMode = (): "live" | "mock" => {
  if (integrations.forceMock) return "mock";
  return integrations.supabase ? "live" : "mock";
};

export const anyDataSourceLive =
  integrations.supabase && (integrations.supermetrics || integrations.hubspot);
