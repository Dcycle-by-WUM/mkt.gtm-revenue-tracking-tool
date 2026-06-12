import { integrations } from "@/lib/config";

// Aviso honesto del estado de conexiones. Mientras falten secretos, las
// pantallas muestran datos de ejemplo para que Ops valide UX y definiciones.
export function StatusBanner() {
  const pending: string[] = [];
  if (!integrations.supabase) pending.push("Supabase");
  if (!integrations.supermetrics) pending.push("Supermetrics (paid)");
  if (!integrations.googleSso) pending.push("SSO Google");

  if (pending.length === 0) return null;

  return (
    <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      <strong>Versión de prueba con datos de ejemplo.</strong> Pendiente de
      conectar: {pending.join(", ")}. HubSpot (CRM) queda bloqueado hasta tener
      la API key. Las cifras son ilustrativas para revisar pantallas y
      definiciones de KPI.
    </div>
  );
}
