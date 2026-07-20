"use client";

import { useState, useTransition } from "react";
import { FilterBar } from "@/components/FilterBar";
import {
  forecastActuals, inMonthRange,
  emptyFilters, MONTHS, CHANNELS,
  type ForecastRow, type Channel, type CampaignRow,
} from "@/lib/mock-data";
import { fmtEur, fmtPct } from "@/lib/kpis";
import { actionUpsertTarget, actionDeleteTarget } from "@/app/actions";

function pacing(pct: number) {
  const cls = pct >= 1 ? "bg-[var(--good-bg)] text-[var(--good-text)]" : pct >= 0.85 ? "bg-[var(--warn-bg)] text-[var(--warn-text)]" : "bg-red-50 text-red-700";
  return <span className={`rounded px-2 py-1 text-xs ${cls}`}>{fmtPct(pct)}</span>;
}

const numCell = "w-24 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-right text-sm tabular-nums";

export function ForecastClient({
  initialTargets,
  campaigns,
}: {
  initialTargets: ForecastRow[];
  campaigns: CampaignRow[];
}) {
  const [rows, setRows] = useState(initialTargets);
  const [filters, setFilters] = useState(emptyFilters);
  const [draft, setDraft] = useState<ForecastRow>({
    channel: "LinkedIn", month: "2026-06", country: "ES", targetSpend: 0, targetPipeline: 0,
  });
  const [, startTransition] = useTransition();

  const persist = (next: ForecastRow) => {
    startTransition(() => { void actionUpsertTarget(next); });
  };

  const update = (i: number, field: "targetSpend" | "targetPipeline", value: number) => {
    setRows((cur) => {
      const next = cur.map((r, idx) => (idx === i ? { ...r, [field]: value } : r));
      persist(next[i]);
      return next;
    });
  };

  const visible = rows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) =>
      (!filters.country || r.country === filters.country) &&
      (!filters.month || r.month === filters.month) &&
      inMonthRange(r.month, filters) &&
      (!filters.channel || r.channel === filters.channel),
    );

  const countries = [...new Set(rows.map((r) => r.country))].sort();
  const inp = "rounded-md border border-[var(--border)] bg-[var(--panel)] px-2 py-1.5 text-sm";

  const add = () => {
    setRows((cur) => [...cur, draft]);
    startTransition(() => { void actionUpsertTarget(draft); });
    setDraft({ ...draft, targetSpend: 0, targetPipeline: 0 });
  };

  const remove = (i: number) => {
    const r = rows[i];
    setRows((cur) => cur.filter((_, idx) => idx !== i));
    startTransition(() => { void actionDeleteTarget(r.channel, r.month, r.country); });
  };

  return (
    <>
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        countries={countries}
        months={[...new Set([...rows.map((r) => r.month), ...campaigns.map((c) => c.month)])].sort()}
        channels={[...new Set([...rows.map((r) => r.channel), ...campaigns.map((c) => c.channel)])].sort()}
      />

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-[var(--subtle)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-3">Canal</th>
              <th className="px-3 py-3">Mes</th>
              <th className="px-3 py-3">País</th>
              <th className="px-3 py-3 text-right">Spend obj. ✏️</th>
              <th className="px-3 py-3 text-right">Spend real 🔒</th>
              <th className="px-3 py-3 text-right">Pipeline obj. ✏️</th>
              <th className="px-3 py-3 text-right">Pipeline real 🔒</th>
              <th className="px-3 py-3 text-right">% cumpl.</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {visible.map(({ r, i }) => {
              const actual = forecastActuals(campaigns, r.channel, r.month, r.country);
              return (
                <tr key={`${r.channel}-${r.month}-${r.country}`} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">{r.channel}</td>
                  <td className="px-3 py-2">{r.month}</td>
                  <td className="px-3 py-2">{r.country}</td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" className={numCell} value={r.targetSpend} onChange={(e) => update(i, "targetSpend", +e.target.value)} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">{fmtEur(actual.spend)}</td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" className={numCell} value={r.targetPipeline} onChange={(e) => update(i, "targetPipeline", +e.target.value)} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-[var(--muted)]">{fmtEur(actual.pipeline)}</td>
                  <td className="px-3 py-2 text-right">{pacing(r.targetPipeline ? actual.pipeline / r.targetPipeline : 0)}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => remove(i)} className="text-[var(--muted)] hover:text-red-400" title="Eliminar objetivo">✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-[var(--muted)]">
        🔒 = real, no editable (viene de los datos con atribución). ✏️ = objetivo manual; cada cambio se guarda en Supabase.
      </p>

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
          onClick={add}
          className="rounded-md bg-[var(--accent)]/20 px-3 py-1.5 text-sm text-[var(--accent)] hover:bg-[var(--accent)]/30"
        >
          + Añadir
        </button>
      </div>
    </>
  );
}
