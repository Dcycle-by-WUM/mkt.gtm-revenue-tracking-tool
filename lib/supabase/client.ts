import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente Supabase compartido. Si las env vars no están, devuelve `null` y
// la capa de datos cae al mock — la app sigue funcionando sin secretos
// (principio de robustez PRD §5).
//
// Browser/server: este módulo solo usa la `anon key` (lecturas con RLS).
// Para escrituras administrativas (ingest jobs) usar `lib/supabase/admin.ts`.

let cached: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const forceMock = process.env.FORCE_MOCK === "true";

  if (!url || !anon || forceMock) {
    cached = null;
    return null;
  }

  cached = createClient(url, anon, {
    auth: { persistSession: false },                 // sin SSO todavía
    global: { headers: { "x-app": "gtm-revenue-tracking" } },
  });
  return cached;
}

export const supabaseLive = (): boolean => getSupabase() !== null;
