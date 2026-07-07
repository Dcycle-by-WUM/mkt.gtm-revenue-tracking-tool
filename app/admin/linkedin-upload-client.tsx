"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/Page";
import type { LinkedInIngestSummary } from "@/lib/data/ad-spend";
import { fmtEur } from "@/lib/kpis";

const emptySummary = (error: string): LinkedInIngestSummary => ({
  ok: false,
  error,
  rowsParsed: 0,
  campaigns: 0,
  spendRows: 0,
  totalSpend: 0,
  dateRange: null,
  countryBreakdown: {},
  multiCampaigns: [],
});

export function LinkedInCsvUploader() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<LinkedInIngestSummary | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = () => {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const fd = new FormData();
    fd.set("file", file);
    startTransition(async () => {
      // Función Netlify dedicada (no Server Action) — parsear miles de filas
      // + varios batches de upsert puede pasarse del timeout corto que da el
      // runtime de Next.js en Netlify para Server Actions.
      try {
        const res = await fetch("/api/upload-linkedin-ads", { method: "POST", body: fd });
        const text = await res.text();
        let summary: LinkedInIngestSummary;
        try {
          summary = JSON.parse(text);
        } catch {
          summary = emptySummary(`Respuesta inesperada del servidor (HTTP ${res.status}): ${text.slice(0, 300)}`);
        }
        setResult(summary);
      } catch (e) {
        setResult(emptySummary(e instanceof Error ? e.message : String(e)));
      }
      router.refresh();
    });
  };

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
          disabled={pending}
          className="text-sm"
        />
        {pending && <span className="text-xs text-[var(--muted)]">Procesando{fileName ? ` ${fileName}` : ""}…</span>}
      </div>

      {result && !pending && (
        <div className="mt-4 border-t border-[var(--border)] pt-3 text-sm">
          {result.ok ? (
            <>
              <div className="text-emerald-300">
                ✓ {result.campaigns} campañas · {result.spendRows} filas campaña×día ·{" "}
                {fmtEur(result.totalSpend)} spend total
                {result.dateRange && (
                  <> · {result.dateRange.min} → {result.dateRange.max}</>
                )}
              </div>
              <div className="mt-2 text-xs text-[var(--muted)]">
                País (nº campañas):{" "}
                {Object.entries(result.countryBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([country, n]) => `${country} (${n})`)
                  .join(" · ")}
              </div>
              {result.multiCampaigns.length > 0 && (
                <details className="mt-2 text-xs text-[var(--muted)]">
                  <summary className="cursor-pointer">
                    {result.multiCampaigns.length} campañas clasificadas como &quot;Multi&quot; (revisar)
                  </summary>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    {result.multiCampaigns.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          ) : (
            <div className="text-amber-300">✗ Error: {result.error}</div>
          )}
        </div>
      )}
    </Panel>
  );
}
