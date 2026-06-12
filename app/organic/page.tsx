import { PageHeader } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { mockSeoKpis, mockAeoKpis } from "@/lib/mock-data";

// Orgánico (SEO) + AEO — Brief §10.
function KpiTable({ rows }: { rows: { kpi: string; value: string; source: string }[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--panel)] text-left text-xs uppercase text-[var(--muted)]">
          <tr>
            <th className="px-4 py-3">KPI</th>
            <th className="px-4 py-3">Valor</th>
            <th className="px-4 py-3">Fuente</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.kpi} className="border-t border-[var(--border)]">
              <td className="px-4 py-3">{r.kpi}</td>
              <td className="px-4 py-3 font-medium tabular-nums">{r.value}</td>
              <td className="px-4 py-3 text-[var(--muted)]">{r.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OrganicPage() {
  return (
    <div>
      <PageHeader
        title="Orgánico (SEO) + AEO"
        subtitle="SEO non-branded, Domain Authority, keywords en Top 3, y AEO (AI Visibility / Share of Voice), conectados hasta pipeline € y deals."
        phase="F5"
      />
      <StatusBanner />
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        SEO orgánico
      </h2>
      <KpiTable rows={mockSeoKpis} />
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        AEO — Answer Engine Optimization
      </h2>
      <KpiTable rows={mockAeoKpis} />
    </div>
  );
}
