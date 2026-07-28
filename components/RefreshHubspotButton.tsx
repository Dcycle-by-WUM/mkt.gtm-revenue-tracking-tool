"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Check, AlertTriangle, X } from "lucide-react";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; total: number }
  | { kind: "skipped"; reason: string }
  | { kind: "error"; msg: string };

// Botón "Actualizar HubSpot" → dispara el sync CRM bajo demanda
// (POST /api/refresh-crm) en vez de esperar al cron horario. Muestra un
// mensaje DEBAJO: "Actualizando…" mientras corre y el resultado al terminar.
export function RefreshHubspotButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function refresh() {
    if (status.kind === "loading") return;
    setStatus({ kind: "loading" });
    try {
      const res = await fetch("/api/refresh-crm", { method: "POST" });
      const data = await res.json();
      if (data?.skipped) {
        setStatus({ kind: "skipped", reason: data.reason ?? "HubSpot no conectado" });
      } else if (data?.ok) {
        setStatus({ kind: "ok", total: data.total ?? 0 });
        router.refresh(); // recarga los datos de la pantalla con lo recién sincronizado
      } else {
        setStatus({ kind: "error", msg: data?.errors?.[0] ?? data?.error ?? "Error desconocido" });
      }
    } catch (e) {
      setStatus({ kind: "error", msg: e instanceof Error ? e.message : "Error de red" });
    }
  }

  const loading = status.kind === "loading";

  return (
    <div className="relative">
      <button
        onClick={refresh}
        disabled={loading}
        title="Traer los últimos datos de HubSpot ahora (sin esperar al sync horario)"
        className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-medium text-[var(--brand-contrast)] transition-colors hover:bg-[var(--brand-hover)] disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {!compact && <span>Actualizar HubSpot</span>}
      </button>

      {/* Mensaje de estado debajo del botón */}
      {status.kind !== "idle" && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 text-sm shadow-[var(--shadow-lg)]">
          {status.kind !== "loading" && (
            <button
              onClick={() => setStatus({ kind: "idle" })}
              className="absolute right-2 top-2 text-[var(--faint)] hover:text-[var(--text)]"
              aria-label="Cerrar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {status.kind === "loading" && (
            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
              <RefreshCw className="h-4 w-4 animate-spin text-[var(--brand)]" />
              <span>Actualizando datos de HubSpot…</span>
            </div>
          )}

          {status.kind === "ok" && (
            <div className="flex items-start gap-2 text-[var(--good-text)]">
              <Check className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">Actualización completada</div>
                <div className="text-xs text-[var(--muted)]">
                  {status.total} filas sincronizadas desde HubSpot.
                </div>
              </div>
            </div>
          )}

          {status.kind === "skipped" && (
            <div className="flex items-start gap-2 text-[var(--warn-text)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">HubSpot no conectado</div>
                <div className="text-xs text-[var(--muted)]">
                  Falta la credencial en el entorno. Al configurarla, el botón traerá los datos al vuelo.
                </div>
              </div>
            </div>
          )}

          {status.kind === "error" && (
            <div className="flex items-start gap-2 text-[var(--error-text)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">No se pudo actualizar</div>
                <div className="break-words text-xs text-[var(--muted)]">{status.msg}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
