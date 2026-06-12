"use client";

import { useState } from "react";
import { PageHeader } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { FilterBar } from "@/components/FilterBar";
import { mockForecast, emptyFilters, MONTHS, CHANNELS, type ForecastRow, type Channel } from "@/lib/mock-data";
import { fmtPct } from "@/lib/kpis";
import { useLocalState } from "@/lib/store";

// Pipeline & Forecast vs Objetivos — Brief §8.5. Totalmente editable.
function pacing(pct: number) {
  const cls = pct >= 1 ? "bg-emerald-500/15 text-emerald-300" : pct >= 0.85 ? "bg-amber-500/15 text-amber-300" : "bg-red-500/15 text-red-300";
  return <span className={`rounded px-2 py-1 text-xs ${cls}`}>{fmtPct(pct)}</span>;
}

const numCell = "w-24 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-right text-sm tabular-nums";

export default function ForecastPage() {
  const [rows, setRows] = useLocalState<ForecastRow[]>("gtm.forecast.v1", mockForecast);
  const [filters, setFilters] = useState(emptyFilters);
  const [draft, setDraft] = useState<ForecastRow>({
    channel: "LinkedIn", month: "2026-06", country: "ES", targetSpend: 0, actualSpend: 0, targetPipeline: 0, actualPipeline: 0,
  });

  const update = (i: number, field: keyof ForecastRow, value: number) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));

  const visible = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) =>
      (!filters.country || r.country === filters.country) &&
      (!filters.month || r.month === filters.month) &&
      (!filters.channel || r.channel === filters.channel),
    );

  const countries = [...new Set(rows.map((r) => r.country))].sort();
  const inp = "rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5 text-sm";

  return (
    <div>
      <PageHeader
        title="Pipeline & Forecast vs Objetivos"
        subtitle="Forecast editable por canal/mes/país. Cambia objetivos y real; el % de cumplimiento se recalcula solo."
      />
      <StatusBanner />
      <FilterBar filters={filters} setFilters={setFilters} countries={countries} />

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--panel)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-3">Canal</th>
              <th className="px-3 py-3">Mes</th>
              <th className="px-3 py-3">País</th>
              <th className="px-3 py-3 text-right">Spend obj.</th>
              <th className="px-3 py-3 text-right">Spend real</th>
              <th className="px-3 py-3 text-right">Pipeline obj.</th>
              <th className="px-3 py-3 text-right">Pipeline real</th>
              <th className="px-3 py-3 text-right">% cumpl.</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {visible.map(({ r, i }) => (
              <tr key={i} className="border-t border-[var(--border)]">
                <td className="px-3 py-2">{r.channel}</td>
                <td className="px-3 py-2">{r.month}</td>
                <td className="px-3 py-2">{r.country}</td>
                <td className="px-3 py-2 text-right">
                  <input type="number" className={numCell} value={r.targetSpend} onChange={(e) => update(i, "targetSpend", +e.target.value)} />
                </td>
                <td className="px-3 py-2 text-right">
                  <input type="number" className={numCell} value={r.actualSpend} onChange={(e) => update(i, "actualSpend", +e.target.value)} />
                </td>
                <td className="px-3 py-2 text-right">
                  <input type="number" className={numCell} value={r.targetPipeline} onChange={(e) => update(i, "targetPipeline", +e.target.value)} />
                </td>
                <td className="px-3 py-2 text-right">
                  <input type="number" className={numCell} value={r.actualPipeline} onChange={(e) => update(i, "actualPipeline", +e.target.value)} />
                </td>
                <td className="px-3 py-2 text-right">{pacing(r.targetPipeline ? r.actualPipeline / r.targetPipeline : 0)}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => setRows(rows.filter((_, idx) => idx !== i))} className="text-[var(--muted)] hover:text-red-400" title="Eliminar">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Añadir fila */}
      <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-[var(--border)] p-4">
        <span className="mr-2 text-xs uppercase tracking-wide text-[var(--muted)]">Añadir objetivo</span>
        <select className={inp} value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value as Channel })}>
          {CHANNELS.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className={inp} value={draft.month} onChange={(e) => setDraft({ ...draft, month: e.target.value })}>
          {MONTHS.map((m) => <option key={m}>{m}</option>)}
        </select>
        <input className={inp + " w-20"} placeholder="País" value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} />
        <input type="number" className={inp + " w-28"} placeholder="Spend obj." value={draft.targetSpend || ""} onChange={(e) => setDraft({ ...draft, targetSpend: +e.target.value })} />
        <input type="number" className={inp + " w-32"} placeholder="Pipeline obj." value={draft.targetPipeline || ""} onChange={(e) => setDraft({ ...draft, targetPipeline: +e.target.value })} />
        <button
          onClick={() => { setRows([...rows, draft]); setDraft({ ...draft, targetSpend: 0, targetPipeline: 0 }); }}
          className="rounded-md bg-[var(--accent)]/20 px-3 py-1.5 text-sm text-[var(--accent)] hover:bg-[var(--accent)]/30"
        >
          + Añadir
        </button>
      </div>
      <div className="mt-3 flex gap-3">
        <button onClick={() => setRows(mockForecast)} className="text-xs text-[var(--muted)] underline">Restablecer valores de ejemplo</button>
      </div>
    </div>
  );
}
