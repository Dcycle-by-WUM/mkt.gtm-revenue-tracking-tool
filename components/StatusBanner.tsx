import { integrations } from "@/lib/config";

// Aviso honesto del estado de conexiones. Tres mensajes posibles:
//  - Si Supabase está conectado pero faltan fuentes de datos: avisa de qué
//    pantallas verán cifras de ejemplo hasta que entren los datos reales.
//  - Si Supabase no está conectado: todo es mock.
//  - Si todo está conectado y hay datos: no muestra nada.
export function StatusBanner() {
  if (!integrations.supabase) {
    return (
      <div className="mb-6 rounded-lg border border-[var(--warn-border)] bg-[var(--warn-bg)] px-4 py-3 text-sm text-[var(--warn-text)]">
        <strong>Versión de prueba con datos de ejemplo.</strong> Falta conectar
        Supabase (NEXT_PUBLIC_SUPABASE_URL + ANON_KEY). Las cifras son
        ilustrativas para revisar pantallas y definiciones de KPI.
      </div>
    );
  }

  const pendingSources: string[] = [];
  if (!integrations.supermetrics) pendingSources.push("Supermetrics (paid)");
  if (!integrations.hubspot) pendingSources.push("HubSpot (CRM)");
  if (!integrations.googleSso) pendingSources.push("SSO Google");

  if (pendingSources.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-[var(--warn-border)] bg-[var(--warn-bg)] px-4 py-3 text-sm text-[var(--warn-text)]">
      <strong>Supabase ✓ conectado.</strong> Pendiente: {pendingSources.join(", ")}.
      Las pantallas que dependen de esas fuentes muestran datos de ejemplo hasta
      que estén las claves.
    </div>
  );
}
