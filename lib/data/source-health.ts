// Estado de las fuentes de datos — combina la configuración real (qué tokens
// están puestos) con la frescura del último sync (de sync_runs). Lo consume
// la pantalla Data Health.

import { getSupabase } from "@/lib/supabase/client";
import { integrations } from "@/lib/config";
import { mockSourceHealth, type SourceHealth } from "@/lib/mock-data";
import type { DbSyncRun } from "@/lib/supabase/types";

export type SourceHealthLive = SourceHealth & {
  lastRun: string | null;
  lastCovered: string | null;
  rows: number | null;
};

const baseRow = (
  source: string,
  method: string,
  ok: boolean,
  detail: string,
  blocked = false,
): SourceHealthLive => ({
  source,
  method,
  status: blocked ? "blocked" : ok ? "ok" : "pending",
  detail,
  lastRun: null,
  lastCovered: null,
  rows: null,
});

export async function getSourceHealth(): Promise<SourceHealthLive[]> {
  // Estado base derivado de la config (qué env vars hay).
  const rows: SourceHealthLive[] = [
    baseRow(
      "LinkedIn Ads (LIA)",
      "Supermetrics API",
      integrations.supermetrics,
      integrations.supermetrics
        ? "Token configurado; pendiente de cron diario."
        : "Autenticado en Supermetrics; falta SUPERMETRICS_API_KEY en env.",
    ),
    baseRow(
      "Google Ads (AW)",
      "Supermetrics API",
      integrations.supermetrics,
      integrations.supermetrics
        ? "Token configurado; pendiente de cron diario."
        : "Autenticado en Supermetrics; falta SUPERMETRICS_API_KEY en env.",
    ),
    baseRow(
      "HubSpot (CRM)",
      "Private App token",
      integrations.hubspot,
      integrations.hubspot
        ? "Token configurado; cron CRM activo."
        : "Pendiente: HUBSPOT_PRIVATE_APP_TOKEN no configurado (se conecta una vez la app esté construida).",
    ),
    baseRow(
      "Supabase (datos)",
      "Postgres",
      integrations.supabase,
      integrations.supabase
        ? `Proyecto vivo: ${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("https://", "")}`
        : "URL configurada pero falta NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    ),
    baseRow(
      "Google Workspace SSO",
      "OAuth (OIDC)",
      integrations.googleSso,
      integrations.googleSso
        ? "OAuth client configurado."
        : "SSO se enchufa cuando esté GOOGLE_OAUTH_CLIENT_ID. Mientras tanto: acceso abierto.",
    ),
  ];

  // Si Supabase no está vivo, devolvemos solo la foto de configuración +
  // los detalles mock para que Data Health tenga contenido.
  const sb = getSupabase();
  if (!sb) {
    return mockSourceHealth.map((m, i) => ({
      ...m,
      lastRun: null,
      lastCovered: null,
      rows: null,
      ...(rows[i] ? { detail: rows[i].detail, status: rows[i].status } : {}),
    }));
  }

  // Frescura por fuente desde sync_runs.
  const { data } = await sb
    .from("sync_runs")
    .select("source, started_at, finished_at, status, rows, last_covered_date")
    .order("started_at", { ascending: false })
    .limit(50);

  const latestBySource = new Map<string, DbSyncRun>();
  for (const r of (data ?? []) as DbSyncRun[]) {
    if (!latestBySource.has(r.source)) latestBySource.set(r.source, r);
  }

  return rows.map((r) => {
    const key = r.source.includes("LinkedIn")
      ? "linkedin"
      : r.source.includes("Google Ads")
      ? "google_ads"
      : r.source.includes("HubSpot")
      ? "hubspot"
      : null;
    const last = key ? latestBySource.get(key) : undefined;
    return last
      ? {
          ...r,
          lastRun: last.finished_at ?? last.started_at,
          lastCovered: last.last_covered_date,
          rows: last.rows,
          status:
            last.status === "ok" ? "ok" : last.status === "error" ? "blocked" : r.status,
        }
      : r;
  });
}
