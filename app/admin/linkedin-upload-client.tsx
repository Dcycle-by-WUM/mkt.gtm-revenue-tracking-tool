"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/Page";
import { getSupabase } from "@/lib/supabase/client";
import type { LinkedInIngestSummary } from "@/lib/data/ad-spend";
import { fmtEur } from "@/lib/kpis";

// Sube a app/api/upload-linkedin-ads (Route Handler nativo de Next.js, no
// una función Netlify a mano — dos intentos con netlify/functions/*.ts
// devolvieron siempre un 500 genérico de plataforma, todo apunta a que
// @netlify/plugin-nextjs intercepta el routing de /.netlify/functions/*
// antes de que llegue a mi función). Espera la respuesta directa; si el
// fetch falla o se corta a media petición, cae a polling contra `sync_runs`
// como red de seguridad (el run puede haber terminado igualmente en el
// servidor aunque la conexión del navegador se haya perdido).

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; fileName: string }
  | { kind: "processing"; fileName: string }
  | { kind: "done"; ok: true; summary: LinkedInIngestSummary }
  | { kind: "done"; ok: false; error: string };

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 min tope de espera en el navegador

export function LinkedInCsvUploader() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  // Red de seguridad: identifica el run por `id` (watermark tomado ANTES de
  // subir), no por timestamp — un filtro por fecha es frágil ante cualquier
  // desfase de reloj navegador↔servidor.
  const pollSyncRun = useCallback(
    async (watermarkId: string | null) => {
      const sb = getSupabase();
      if (!sb) {
        setPhase({ kind: "done", ok: false, error: "Supabase no configurado en el navegador (falta NEXT_PUBLIC_SUPABASE_ANON_KEY)." });
        return;
      }
      const deadline = Date.now() + POLL_TIMEOUT_MS;
      while (Date.now() < deadline) {
        const { data, error } = await sb
          .from("sync_runs")
          .select("id, status, rows, last_covered_date, error_message")
          .eq("source", "linkedin")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          setPhase({ kind: "done", ok: false, error: `Error consultando sync_runs: ${error.message}` });
          return;
        }
        if (data && data.id !== watermarkId && data.status !== "running") {
          if (data.status === "ok") {
            setPhase({
              kind: "done",
              ok: true,
              summary: {
                ok: true,
                rowsParsed: 0,
                campaigns: 0,
                spendRows: data.rows ?? 0,
                totalSpend: 0,
                dateRange: data.last_covered_date ? { min: "", max: data.last_covered_date } : null,
                countryBreakdown: {},
                multiCampaigns: [],
              },
            });
          } else {
            setPhase({ kind: "done", ok: false, error: data.error_message ?? "Fallo desconocido — revisa Data Health." });
          }
          router.refresh();
          return;
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      setPhase({
        kind: "done",
        ok: false,
        error: "Sigue procesándose pasado el tiempo de espera del navegador — revisa /data-health, probablemente termine igualmente.",
      });
    },
    [router],
  );

  const upload = () => {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setPhase({ kind: "uploading", fileName: file.name });

    const fd = new FormData();
    fd.set("file", file);

    (async () => {
      const sb = getSupabase();
      let watermarkId: string | null = null;
      if (sb) {
        const { data } = await sb
          .from("sync_runs")
          .select("id")
          .eq("source", "linkedin")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        watermarkId = data?.id ?? null;
      }

      try {
        const res = await fetch("/api/upload-linkedin-ads", { method: "POST", body: fd });
        const text = await res.text();
        let summary: LinkedInIngestSummary;
        try {
          summary = JSON.parse(text);
        } catch {
          throw new Error(`Respuesta no-JSON (HTTP ${res.status}): ${text.slice(0, 300)}`);
        }
        if (summary.ok) {
          setPhase({ kind: "done", ok: true, summary });
        } else {
          setPhase({ kind: "done", ok: false, error: summary.error ?? "Fallo desconocido." });
        }
        router.refresh();
      } catch (e) {
        // El fetch falló o se cortó (p.ej. timeout de plataforma a media
        // petición) — el run puede haber terminado igual en el servidor.
        setPhase({ kind: "processing", fileName: file.name });
        await pollSyncRun(watermarkId);
      }
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
          <span className="text-xs text-[var(--muted)]">
            La petición se cortó, comprobando si terminó en el servidor…
          </span>
        )}
      </div>

      {phase.kind === "done" && (
        <div className="mt-4 border-t border-[var(--border)] pt-3 text-sm">
          {phase.ok ? (
            <>
              <div className="text-emerald-300">
                ✓ {phase.summary.campaigns > 0 && <>{phase.summary.campaigns} campañas · </>}
                {phase.summary.spendRows} filas campaña×día actualizadas
                {phase.summary.totalSpend > 0 && <> · {fmtEur(phase.summary.totalSpend)} spend total</>}
                {phase.summary.dateRange && (
                  <>
                    {" "}
                    · {phase.summary.dateRange.min || "…"} → {phase.summary.dateRange.max}
                  </>
                )}
              </div>
              {Object.keys(phase.summary.countryBreakdown).length > 0 && (
                <div className="mt-2 text-xs text-[var(--muted)]">
                  País (nº campañas):{" "}
                  {Object.entries(phase.summary.countryBreakdown)
                    .sort((a, b) => b[1] - a[1])
                    .map(([country, n]) => `${country} (${n})`)
                    .join(" · ")}
                </div>
              )}
              {phase.summary.multiCampaigns.length > 0 && (
                <details className="mt-2 text-xs text-[var(--muted)]">
                  <summary className="cursor-pointer">
                    {phase.summary.multiCampaigns.length} campañas clasificadas como &quot;Multi&quot; (revisar)
                  </summary>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    {phase.summary.multiCampaigns.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <div className="text-amber-300">✗ Error: {phase.error}</div>
          )}
        </div>
      )}
    </Panel>
  );
}
