"use client";

import { useState } from "react";
import { groupBy, type CampaignRow, type Dimension } from "@/lib/mock-data";
import { fmtEur, fmtNum, fmtPct, roi } from "@/lib/kpis";

// Tabla dinámica (pivot) que se actualiza sola al cambiar la dimensión o las
// filas (filtros). Reutilizable en Overview y Explorer.
const dimLabels: Record<Dimension, string> = {
  channel: "Canal",
  country: "País",
  campaign: "Campaña",
  month: "Mes",
};

export function PivotTable({
  rows,
  dims = ["country", "channel", "campaign", "month"],
  initialDim = "country",
}: {
  rows: CampaignRow[];
  dims?: Dimension[];
  initialDim?: Dimension;
}) {
  const [dim, setDim] = useState<Dimension>(initialDim);
  const grouped = groupBy(rows, dim);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm text-[var(--muted)]">Agrupar por:</span>
        {dims.map((d) => (
          <button
            key={d}
            onClick={() => setDim(d)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              dim === d ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "bg-white/5 hover:bg-white/10"
            }`}
          >
            {dimLabels[d]}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--panel)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">{dimLabels[dim]}</th>
              <th className="px-4 py-3 text-right">Spend</th>
              <th className="px-4 py-3 text-right">Leads</th>
              <th className="px-4 py-3 text-right">MQL</th>
              <th className="px-4 py-3 text-right">SQL</th>
              <th className="px-4 py-3 text-right">Pipeline €</th>
              <th className="px-4 py-3 text-right">ROI</th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-[var(--muted)]">
                  Sin datos para los filtros seleccionados.
                </td>
              </tr>
            )}
            {grouped.map(([key, m]) => (
              <tr key={key} className="border-t border-[var(--border)]">
                <td className="px-4 py-3 font-mono text-xs">{key}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtEur(m.spend)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtNum(m.leads)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtNum(m.mql)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtNum(m.sql)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtEur(m.pipeline)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtPct(roi(m))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
