"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/Page";
import { getSupabase } from "@/lib/supabase/client";
import type { LinkedInIngestSummary, ManualCountry } from "@/lib/data/ad-spend";
import {
  decodeLinkedInCsv,
  parseLinkedInAdsCsv,
  aggregateLinkedInAds,
  type LinkedInCampaignMeta,
  type LinkedInCampaignDaySpend,
} from "@/lib/linkedin-ads";
import { fmtEur } from "@/lib/kpis";

// El CSV se decodifica, parsea y agrega AQUÍ, en el navegador; al servidor
// (app/api/upload-linkedin-ads, Route Handler) solo viaja el agregado
// campaña×día como JSON. Motivo: el export de LinkedIn (Ad × día, UTF-16)
// puede superar el límite de payload de las funciones de Netlify (~6 MB) —
// subiendo el CSV crudo, la plataforma lo rechazaba antes de llegar al
// código y el navegador solo veía un error opaco. De paso, un archivo
// equivocado o mal formado falla al instante con un mensaje concreto, sin
// ida y vuelta al servidor. Si el fetch falla a media petición, cae a
// polling contra `sync_runs` como red de seguridad (el run puede haber
// terminado igualmente en el servidor).

type PendingUpload = {
  fileName: string;
  rowsParsed: number;
  campaigns: LinkedInCampaignMeta[];
  spendRows: LinkedInCampaignDaySpend[];
  // Campañas "Multi sin señal" (nombre sin país ni marcador INT/MULTI/…) y
  // sin override previo: se pregunta el país antes de guardar.
  ask: string[];
};

type Phase =
  | { kind: "idle" }
  | { kind: "review"; pending: PendingUpload }
  | { kind: "uploading"; fileName: string }
  | { kind: "processing"; fileName: string }
  | { kind: "done"; ok: true; summary: LinkedInIngestSummary }
  | { kind: "done"; ok: false; error: string };

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 min tope de espera en el navegador

// Mismo vocabulario que parseLinkedInCountry (y que valida el servidor).
const COUNTRY_CHOICES = ["Multi", "Spain", "UK", "USA", "Mexico", "Netherlands", "UAE"] as const;

export function LinkedInCsvUploader() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  // País elegido por campaña en el paso de revisión (nombre → país).
  const [choices, setChoices] = useState<Record<string, string>>({});
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

  // Envío del agregado (+ decisiones manuales de país) al servidor.
  const send = useCallback(
    async (pending: Omit<PendingUpload, "ask">, manualCountries: ManualCountry[]) => {
      setPhase({ kind: "uploading", fileName: pending.fileName });
      const payload = JSON.stringify({
        rowsParsed: pending.rowsParsed,
        campaigns: pending.campaigns,
        spendRows: pending.spendRows,
        manualCountries,
      });

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

      // Solo viaja el agregado campaña×día (KBs, no MBs).
      let res: Response;
      let text: string;
      try {
        res = await fetch("/api/upload-linkedin-ads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
        text = await res.text();
      } catch {
        // El fetch falló o se cortó (p.ej. timeout de plataforma a media
        // petición) — el run puede haber terminado igual en el servidor.
        setPhase({ kind: "processing", fileName: pending.fileName });
        await pollSyncRun(watermarkId);
        return;
      }

      let summary: LinkedInIngestSummary;
      try {
        summary = JSON.parse(text);
      } catch {
        // El servidor respondió, pero no fue nuestro handler (p.ej. un error
        // HTML de la plataforma) — enseñar qué llegó, no enmascararlo.
        setPhase({
          kind: "done",
          ok: false,
          error: `El servidor respondió HTTP ${res.status} sin JSON: ${text.slice(0, 300) || "(cuerpo vacío)"} — revisa /data-health por si el run llegó a registrarse.`,
        });
        return;
      }
      if (summary.ok) {
        setPhase({ kind: "done", ok: true, summary });
      } else {
        setPhase({ kind: "done", ok: false, error: summary.error ?? "Fallo desconocido." });
      }
      router.refresh();
    },
    [pollSyncRun, router],
  );

  const upload = () => {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setPhase({ kind: "uploading", fileName: file.name });
    setChoices({});

    (async () => {
      // 1) Parseo + agregación en el navegador. Un archivo equivocado
      //    (formato, columnas, delimitador) falla aquí mismo, con mensaje
      //    concreto y sin tocar el servidor.
      let pending: Omit<PendingUpload, "ask">;
      try {
        const rawRows = parseLinkedInAdsCsv(decodeLinkedInCsv(await file.arrayBuffer()));
        if (rawRows.length === 0) {
          throw new Error("El archivo se leyó pero no contiene filas de datos con Campaign ID.");
        }
        const agg = aggregateLinkedInAds(rawRows);
        pending = {
          fileName: file.name,
          rowsParsed: rawRows.length,
          campaigns: agg.campaigns,
          spendRows: agg.spendRows,
        };
      } catch (e) {
        setPhase({ kind: "done", ok: false, error: e instanceof Error ? e.message : String(e) });
        return;
      } finally {
        // Permite re-seleccionar el mismo archivo (onChange no dispara si
        // el value no cambia).
        if (inputRef.current) inputRef.current.value = "";
      }

      // 2) Campañas "Multi sin señal" → preguntar el país antes de guardar,
      //    salvo que ya exista un override de una subida anterior (esas se
      //    resuelven solas en el servidor y no se vuelve a preguntar).
      let overridePatterns: string[] = [];
      const sb = getSupabase();
      if (sb) {
        const { data } = await sb.from("country_overrides").select("pattern");
        overridePatterns = (data ?? []).map((r) => String(r.pattern).toLowerCase());
      }
      const ask = pending.campaigns
        .filter((c) => c.countryUncertain)
        .filter((c) => {
          const name = c.campaignName.toLowerCase();
          return !overridePatterns.some((p) => name.includes(p));
        })
        .map((c) => c.campaignName)
        .sort((a, b) => a.localeCompare(b));

      if (ask.length === 0) {
        await send(pending, []);
        return;
      }
      setPhase({ kind: "review", pending: { ...pending, ask } });
    })();
  };

  const confirmReview = (pending: PendingUpload) => {
    // Toda campaña revisada se persiste como override — también las que se
    // quedan en Multi — para no volver a preguntar en la próxima subida.
    const manualCountries: ManualCountry[] = pending.ask.map((name) => ({
      campaignName: name,
      country: choices[name] ?? "Multi",
    }));
    const byName = new Map(manualCountries.map((m) => [m.campaignName, m.country]));
    const campaigns = pending.campaigns.map((c) =>
      byName.has(c.campaignName) ? { ...c, countryParsed: byName.get(c.campaignName)! } : c,
    );
    void send({ ...pending, campaigns }, manualCountries);
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

      {phase.kind === "review" && (
        <div className="mt-4 border-t border-[var(--border)] pt-3 text-sm">
          <div className="mb-2">
            {phase.pending.ask.length} campañas sin país reconocible en el nombre.
            Asigna el país antes de guardar — la elección se recuerda para
            futuras subidas (no se volverá a preguntar por estas campañas):
          </div>
          <ul className="space-y-1.5">
            {phase.pending.ask.map((name) => (
              <li key={name} className="flex items-center gap-2">
                <select
                  value={choices[name] ?? "Multi"}
                  onChange={(e) => setChoices((prev) => ({ ...prev, [name]: e.target.value }))}
                  className="rounded border border-[var(--border)] bg-transparent px-1 py-0.5 text-xs"
                >
                  {COUNTRY_CHOICES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[var(--muted)]">{name}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => confirmReview(phase.pending)}
              className="rounded border border-[var(--border)] px-3 py-1 text-xs hover:bg-white/5"
            >
              Confirmar y subir
            </button>
            <button
              onClick={() => setPhase({ kind: "idle" })}
              className="rounded border border-transparent px-3 py-1 text-xs text-[var(--muted)] hover:border-[var(--border)]"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

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
