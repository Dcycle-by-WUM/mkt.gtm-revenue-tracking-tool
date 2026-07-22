"use client";

import {
  buildMonthMatrix, METRIC_LABELS, METRIC_IS_EUR,
  type CampaignRow, type Dimension, type MetricKey,
} from "@/lib/mock-data";
import { fmtEur, fmtNum } from "@/lib/kpis";
import { countryDisplayName } from "@/lib/regions";

// Matriz de comparación: una dimensión (país / canal / campaña) en filas,
// meses en columnas, UNA métrica por celda, con totales de fila y columna.
// Es lo que permite comparar "total país por mes" de un vistazo — controlada
// desde fuera (rowDim/metric) para poder guardarla como vista.
const ROW_DIMS: { dim: Dimension; label: string }[] = [
  { dim: "country", label: "País" },
  { dim: "channel", label: "Canal" },
  { dim: "campaign", label: "Campaña" },
];
const METRICS: MetricKey[] = ["pipeline", "leads", "mql", "sql", "closedWon", "spend"];

export function MatrixTable({
  rows,
  rowDim,
  metric,
  onRowDim,
  onMetric,
}: {
  rows: CampaignRow[];
  rowDim: Dimension;
  metric: MetricKey;
  onRowDim: (d: Dimension) => void;
  onMetric: (m: MetricKey) => void;
}) {
  const m = buildMonthMatrix(rows, rowDim, metric);
  const eur = METRIC_IS_EUR[metric];
  const fmt = (v: number) => (v === 0 ? "·" : eur ? fmtEur(v) : fmtNum(v));
  // Filas en cero en todos los meses son ruido, no señal — se quitan.
  const visibleRows = m.rows.filter((r) => r.total !== 0);
  const rowLabel = (key: string) => (rowDim === "country" ? countryDisplayName(key) : key);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg bg-[var(--subtle)] p-1">
          {ROW_DIMS.map(({ dim, label }) => (
            <button
              key={dim}
              onClick={() => onRowDim(dim)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                rowDim === dim
                  ? "bg-[var(--panel)] font-medium text-[var(--text)] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--text)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-[var(--muted)]">Métrica:</span>
          <select className="control" value={metric} onChange={(e) => onMetric(e.target.value as MetricKey)}>
            {METRICS.map((k) => (
              <option key={k} value={k}>{METRIC_LABELS[k]}</option>
            ))}
          </select>
        </div>
      </div>

      {visibleRows.length === 0 || m.months.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-6 text-center text-sm text-[var(--muted)]">
          No hay datos para el filtro actual.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-[var(--subtle)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="sticky left-0 z-10 bg-[var(--subtle)] px-3 py-2 text-left">
                  {ROW_DIMS.find((d) => d.dim === rowDim)?.label}
                </th>
                {m.months.map((mo) => (
                  <th key={mo} className="px-3 py-2 text-right font-mono">{mo}</th>
                ))}
                <th className="px-3 py-2 text-right font-semibold text-[var(--text)]">Total</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => (
                <tr key={r.key} className="border-t border-[var(--border)]">
                  <td
                    className={`sticky left-0 z-10 bg-[var(--panel)] px-3 py-2 ${
                      rowDim === "country" ? "text-sm" : "font-mono text-xs"
                    }`}
                  >
                    {rowLabel(r.key)}
                  </td>
                  {r.cells.map((v, i) => (
                    <td key={i} className={`px-3 py-2 text-right tabular-nums ${v === 0 ? "text-[var(--muted)]" : ""}`}>
                      {fmt(v)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--border)] bg-[var(--subtle)] font-semibold">
                <td className="sticky left-0 z-10 bg-[var(--subtle)] px-3 py-2">Total</td>
                {m.colTotals.map((v, i) => (
                  <td key={i} className="px-3 py-2 text-right tabular-nums">{fmt(v)}</td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums">{fmt(m.grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
