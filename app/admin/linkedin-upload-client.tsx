"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/Page";
import { getSupabase } from "@/lib/supabase/client";

// Sube a una Background Function de Netlify (hasta 15 min, ver
// netlify/functions/upload-linkedin-ads-background.ts) — necesaria porque
// parsear miles de filas + varios batches de upsert supera el límite de
// ejecución de un endpoint síncrono normal (~10-26s), lo que antes producía
// un 500 genérico de plataforma o un crash del lado cliente.
//
// Netlify no reenvía la respuesta real de una Background Function al
// llamador (solo confirma que se aceptó la invocación) — así que en vez de
// esperar el `fetch`, hacemos polling contra `sync_runs` (lectura vía anon
// key, RLS ya lo permite) hasta ver el run pasar de "running" a "ok"/"error".

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; fileName: string }
  | { kind: "processing"; fileName: string }
  | { kind: "done"; ok: true; rows: number | null; lastCovered: string | null }
  | { kind: "done"; ok: false; error: string };

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 min tope de espera en el navegador

export function LinkedInCsvUploader() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  const pollSyncRun = useCallback(
    async (since: string, fileName: string) => {
      const sb = getSupabase();
      if (!sb) {
        setPhase({ kind: "done", ok: false, error: "Supabase no configurado en el navegador (falta NEXT_PUBLIC_SUPABASE_ANON_KEY)." });
        return;
      }
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const { data, error } = await sb
          .from("sync_runs")
          .select("status, rows, last_covered_date, error_message")
          .eq("source", "linkedin")
          .gte("started_at", since)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          setPhase({ kind: "done", ok: false, error: `Error consultando sync_runs: ${error.message}` });
          return;
        }
        if (data && data.status !== "running") {
          if (data.status === "ok") {
            setPhase({ kind: "done", ok: true, rows: data.rows, lastCovered: data.last_covered_date });
          } else {
            setPhase({ kind: "done", ok: false, error: data.error_message ?? "Fallo desconocido — revisa los logs de la función en Netlify." });
          }
          router.refresh();
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      setPhase({
        kind: "done",
        ok: false,
        error: `"${fileName}" sigue procesándose pasado el tiempo de espera del navegador — revisa /data-health, probablemente termine igualmente.`,
      });
    },
    [router],
  );

  const upload = () => {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    const since = new Date().toISOString();
    setPhase({ kind: "uploading", fileName: file.name });

    const fd = new FormData();
    fd.set("file", file);

    (async () => {
      try {
        // Las Background Functions responden ~inmediatamente con un 202
        // (aceptado) — el trabajo real sigue corriendo después.
        await fetch("/.netlify/functions/upload-linkedin-ads-background", {
          method: "POST",
          body: fd,
        });
      } catch (e) {
        setPhase({ kind: "done", ok: false, error: e instanceof Error ? e.message : String(e) });
        return;
      }
      setPhase({ kind: "processing", fileName: file.name });
      await pollSyncRun(since, file.name);
    })();
  };

  const busy = phase.kind === "uploading" || phase.kind === "processing";

  return (
    <Panel title="LinkedIn Ads — carga manual (CSV)">
      <p className="mb-3 text-xs text-[var(--muted)]">
        Fase 1 sin Supermetrics: sube el export &quot;Ad Performance Report&quot;
        de LinkedIn Campaign Manager (por Ad × día). Se agrega a nivel
        campaña × día y se cruza con HubSpot por <code>Campaign Name</code> →
        <code>utm_campaign</code>. Idempotente: subir un periodo ya cargado no
        duplica; subir un mes nuevo (p.ej. julio) se suma sin tocar el resto.
        Procesa en segundo plano — puede tardar uno o dos minutos con
        ficheros grandes.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={upload}
          disabled={busy}
          className="text-sm"
        />
        {phase.kind === "uploading" && (
          <span className="text-xs text-[var(--muted)]">Subiendo {phase.fileName}…</span>
        )}
        {phase.kind === "processing" && (
          <span className="text-xs text-[var(--muted)]">Procesando {phase.fileName} en segundo plano…</span>
        )}
      </div>

      {phase.kind === "done" && (
        <div className="mt-4 border-t border-[var(--border)] pt-3 text-sm">
          {phase.ok ? (
            <div className="text-emerald-300">
              ✓ Sync completado — {phase.rows ?? "?"} filas campaña×día actualizadas
              {phase.lastCovered && <> · último día cubierto {phase.lastCovered}</>}.
              Revisa el desglose en{" "}
              <a href="/data-health" className="underline">Data Health</a> o{" "}
              <a href="/" className="underline">Overview</a>.
            </div>
          ) : (
            <div className="text-amber-300">✗ Error: {phase.error}</div>
          )}
        </div>
      )}
    </Panel>
  );
}
