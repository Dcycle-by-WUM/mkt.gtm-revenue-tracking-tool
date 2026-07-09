"use client";

import { useState } from "react";
import { groupByMulti, DIMENSION_LABELS, type CampaignRow, type Dimension } from "@/lib/mock-data";
import { fmtEur, fmtNum, fmtPct, roi } from "@/lib/kpis";

// Tabla dinámica (pivot) multi-nivel: el usuario monta su propia agrupación
// encadenando dimensiones (ej. País + Mes, País + Canal). Se recalcula sola.
export function PivotTable({
  rows,
  dims = ["country", "channel", "campaign", "month"],
  initialDims = ["country"],
}: {
  rows: CampaignRow[];
  dims?: Dimension[];
  initialDims?: Dimension[];
}) {
  const [selected, setSelected] = useState<Dimension[]>(initialDims);

  const toggle = (d: Dimension) =>
    setSelected((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  const groups = groupByMulti(rows, selected);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--muted)]">Agrupar por:</span>
        {dims.map((d) => {
          const order = selected.indexOf(d);
          const active = order !== -1;
          return (
            <button
              key={d}
              onClick={() => toggle(d)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${
                active ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "bg-[var(--subtle)] hover:bg-[var(--subtle-hover)]"
              }`}
            >
              {active && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--accent)]/40 text-[10px]">
                  {order + 1}
                </span>
              )}
              {DIMENSION_LABELS[d]}
            </button>
          );
        })}
        {selected.length > 0 && (
          <button onClick={() => setSelected([])} className="text-xs text-[var(--muted)] underline">
            quitar todo (total)
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-[var(--subtle)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              {selected.length === 0 && <th className="px-4 py-3">Total</th>}
              {selected.map((d) => (
                <th key={d} className="px-4 py-3">{DIMENSION_LABELS[d]}</th>
              ))}
              <th className="px-4 py-3 text-right">Spend</th>
              <th className="px-4 py-3 text-right">Leads</th>
              <th className="px-4 py-3 text-right">MQL</th>
              <th className="px-4 py-3 text-right">SQL</th>
              <th className="px-4 py-3 text-right">Pipeline €</th>
              <th className="px-4 py-3 text-right">ROI</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, i) => (
              <tr key={i} className="border-t border-[var(--border)]">
                {selected.length === 0 && <td className="px-4 py-3 text-[var(--muted)]">Todo</td>}
                {g.keys.map((k, j) => (
                  <td key={j} className="px-4 py-3 font-mono text-xs">{k}</td>
                ))}
                <td className="px-4 py-3 text-right tabular-nums">{fmtEur(g.metrics.spend)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtNum(g.metrics.leads)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtNum(g.metrics.mql)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtNum(g.metrics.sql)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtEur(g.metrics.pipeline)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtPct(roi(g.metrics))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected.length > 1 && (
        <p className="mt-2 text-xs text-[var(--muted)]">
          Agrupando por {selected.map((d) => DIMENSION_LABELS[d]).join(" › ")}. Pulsa una dimensión para añadir/quitar.
        </p>
      )}
    </div>
  );
}
