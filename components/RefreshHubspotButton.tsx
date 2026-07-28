"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Check, AlertTriangle } from "lucide-react";

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; total: number }
  | { kind: "skipped"; reason: string }
  | { kind: "error"; msg: string };

// Botón "Actualizar HubSpot" → dispara el sync CRM bajo demanda
// (POST /api/refresh-crm) en vez de esperar al cron horario. Muestra estado de
// carga y un feedback breve. `compact` = solo icono (para el Topbar).
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
    // El mensaje de resultado se desvanece; el botón vuelve a "idle".
    setTimeout(() => setStatus((s) => (s.kind === "loading" ? s : { kind: "idle" })), 6000);
  }

  const loading = status.kind === "loading";

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={refresh}
        disabled={loading}
        title="Traer los últimos datos de HubSpot ahora (sin esperar al sync horario)"
        className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-medium text-[var(--brand-contrast)] transition-colors hover:bg-[var(--brand-hover)] disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {!compact && <span>{loading ? "Actualizando…" : "Actualizar HubSpot"}</span>}
      </button>

      {status.kind === "ok" && (
        <span className="inline-flex items-center gap-1 rounded-md bg-[var(--good-bg)] px-2 py-1 text-xs font-medium text-[var(--good-text)]">
          <Check className="h-3.5 w-3.5" /> {status.total} filas actualizadas
        </span>
      )}
      {status.kind === "skipped" && (
        <span className="inline-flex items-center gap-1 rounded-md bg-[var(--warn-bg)] px-2 py-1 text-xs font-medium text-[var(--warn-text)]">
          <AlertTriangle className="h-3.5 w-3.5" /> HubSpot no conectado
        </span>
      )}
      {status.kind === "error" && (
        <span
          title={status.msg}
          className="inline-flex max-w-[220px] items-center gap-1 truncate rounded-md bg-[var(--error-bg)] px-2 py-1 text-xs font-medium text-[var(--error-text)]"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {status.msg}
        </span>
      )}
    </div>
  );
}
