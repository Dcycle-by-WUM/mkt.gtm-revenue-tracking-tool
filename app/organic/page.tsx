import { PageHeader } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { getSeoKpis, getAeoKpis, type OrganicKpi } from "@/lib/data/organic";

export const dynamic = "force-dynamic";

// Orgánico (SEO) + AEO — PRD §11.
function KpiTable({ rows }: { rows: OrganicKpi[] }) {
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

export default async function OrganicPage() {
  // Mes actual por defecto.
  const month = new Date().toISOString().slice(0, 7);
  const [seo, aeo] = await Promise.all([getSeoKpis(month), getAeoKpis(month)]);

  return (
    <div>
      <PageHeader
        title="Orgánico (SEO) + AEO"
        subtitle="SEO non-branded, Domain Authority, keywords en Top 3, y AEO (AI Visibility / Share of Voice), conectados hasta pipeline € y deals."
      />
      <StatusBanner />
      <p className="mb-4 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
        Fuentes externas (DA: Moz/Ahrefs/Semrush · AI-visibility: Profound/Peec/Otterly/Semrush AI) están "on hold"
        en <code>docs/DECISIONES.md</code>. El modelo y las pantallas ya están en su sitio: se enchufan en cuanto
        se decida la herramienta.
      </p>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">SEO orgánico</h2>
      <KpiTable rows={seo} />
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">AEO — Answer Engine Optimization</h2>
      <KpiTable rows={aeo} />
    </div>
  );
}
