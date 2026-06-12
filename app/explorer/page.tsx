"use client";

import { useState } from "react";
import { PageHeader } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { mockCampaigns, type CampaignRow } from "@/lib/mock-data";
import { fmtEur, fmtNum, fmtPct, roi, type ChannelMetrics } from "@/lib/kpis";

// Explorer / Desglose libre (pivot) — Brief §8.6.
type Dimension = "channel" | "country" | "campaign";
const dims: { key: Dimension; label: string }[] = [
  { key: "channel", label: "Canal" },
  { key: "country", label: "País" },
  { key: "campaign", label: "Campaña" },
];

const empty = (): ChannelMetrics => ({
  spend: 0, impressions: 0, clicks: 0, leads: 0, mql: 0, sql: 0, pipeline: 0, closedWon: 0,
});

function pivot(rows: CampaignRow[], dim: Dimension) {
  const map = new Map<string, ChannelMetrics>();
  for (const r of rows) {
    const key = r[dim];
    const acc = map.get(key) ?? empty();
    acc.spend += r.spend; acc.leads += r.leads; acc.mql += r.mql;
    acc.sql += r.sql; acc.pipeline += r.pipeline; acc.closedWon += r.closedWon;
    map.set(key, acc);
  }
  return [...map.entries()];
}

export default function ExplorerPage() {
  const [dim, setDim] = useState<Dimension>("country");
  const grouped = pivot(mockCampaigns, dim);

  return (
    <div>
      <PageHeader
        title="Explorer / Desglose libre (pivot)"
        subtitle="Pivota cualquier métrica por Canal / País / Campaña / Mes; vistas guardadas y exportación en producción."
        phase="F2"
      />
      <StatusBanner />

      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-[var(--muted)]">Pivotar por:</span>
        {dims.map((d) => (
          <button
            key={d.key}
            onClick={() => setDim(d.key)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              dim === d.key
                ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                : "bg-white/5 text-[var(--text)] hover:bg-white/10"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--panel)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">{dims.find((d) => d.key === dim)!.label}</th>
              <th className="px-4 py-3 text-right">Spend</th>
              <th className="px-4 py-3 text-right">Leads</th>
              <th className="px-4 py-3 text-right">MQL</th>
              <th className="px-4 py-3 text-right">SQL</th>
              <th className="px-4 py-3 text-right">Pipeline €</th>
              <th className="px-4 py-3 text-right">ROI</th>
            </tr>
          </thead>
          <tbody>
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
