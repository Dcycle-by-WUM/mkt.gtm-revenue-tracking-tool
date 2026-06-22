import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente administrativo (service role). SOLO server-side: nunca importar
// desde un Client Component. Se usa por los jobs de ingesta y por los
// Route Handlers / Server Actions que modifican datos. Bypassa RLS.

let cached: SupabaseClient | null | undefined;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !service) {
    cached = null;
    return null;
  }

  cached = createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function requireSupabaseAdmin(): SupabaseClient {
  const c = getSupabaseAdmin();
  if (!c) {
    throw new Error(
      "Supabase admin no configurado. Necesitas SUPABASE_SERVICE_ROLE_KEY en el entorno.",
    );
  }
  return c;
}
