import { PageHeader } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { mockForecast } from "@/lib/mock-data";
import { fmtEur, fmtPct } from "@/lib/kpis";

// Pipeline & Forecast vs Objetivos — Brief §8.5.
function pacingBadge(pct: number) {
  const cls =
    pct >= 1 ? "bg-emerald-500/15 text-emerald-300" : pct >= 0.85 ? "bg-amber-500/15 text-amber-300" : "bg-red-500/15 text-red-300";
  return <span className={`rounded px-2 py-1 text-xs ${cls}`}>{fmtPct(pct)}</span>;
}

export default function ForecastPage() {
  return (
    <div>
      <PageHeader
        title="Pipeline & Forecast vs Objetivos"
        subtitle="Forecast manual por canal/mes/país; real desde HubSpot; % cumplimiento y pacing con alertas de desvío."
        phase="F3"
      />
      <StatusBanner />
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--panel)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Canal</th>
              <th className="px-4 py-3">Mes</th>
              <th className="px-4 py-3">País</th>
              <th className="px-4 py-3 text-right">Spend obj.</th>
              <th className="px-4 py-3 text-right">Spend real</th>
              <th className="px-4 py-3 text-right">Pipeline obj.</th>
              <th className="px-4 py-3 text-right">Pipeline real</th>
              <th className="px-4 py-3 text-right">% cumpl. pipeline</th>
            </tr>
          </thead>
          <tbody>
            {mockForecast.map((f, i) => (
              <tr key={i} className="border-t border-[var(--border)]">
                <td className="px-4 py-3">{f.channel}</td>
                <td className="px-4 py-3">{f.month}</td>
                <td className="px-4 py-3">{f.country}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtEur(f.targetSpend)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtEur(f.actualSpend)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtEur(f.targetPipeline)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtEur(f.actualPipeline)}</td>
                <td className="px-4 py-3 text-right">
                  {pacingBadge(f.actualPipeline / f.targetPipeline)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[var(--muted)]">
        🟢 ≥100 % · 🟡 85–99 % · 🔴 &lt;85 % del objetivo de pipeline.
      </p>
    </div>
  );
}
