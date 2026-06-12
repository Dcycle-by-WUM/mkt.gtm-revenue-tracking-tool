import { StatusBanner } from "@/components/StatusBanner";
import { mockCampaigns, totals, type CampaignRow } from "@/lib/mock-data";
import {
  fmtEur,
  fmtNum,
  fmtPct,
  ctr,
  cpc,
  cpm,
  cpl,
  cpmql,
  cpsql,
  roi,
} from "@/lib/kpis";

// Paid Media Performance — Brief §8.3. Tabla canal × campaña con todas las
// métricas de §7.6. País por GRUPO en LinkedIn (§7.3).
const columns: { key: string; label: string; fn: (r: CampaignRow) => string }[] = [
  { key: "spend", label: "Spend", fn: (r) => fmtEur(r.spend) },
  { key: "impr", label: "Impr.", fn: (r) => fmtNum(r.impressions) },
  { key: "clicks", label: "Clics", fn: (r) => fmtNum(r.clicks) },
  { key: "ctr", label: "CTR", fn: (r) => fmtPct(ctr(r)) },
  { key: "cpc", label: "CPC", fn: (r) => fmtEur(cpc(r)) },
  { key: "cpm", label: "CPM", fn: (r) => fmtEur(cpm(r)) },
  { key: "leads", label: "Leads", fn: (r) => fmtNum(r.leads) },
  { key: "mql", label: "MQL", fn: (r) => fmtNum(r.mql) },
  { key: "sql", label: "SQL", fn: (r) => fmtNum(r.sql) },
  { key: "cpl", label: "CPL", fn: (r) => fmtEur(cpl(r)) },
  { key: "cpmql", label: "CPMQL", fn: (r) => fmtEur(cpmql(r)) },
  { key: "cpsql", label: "CPSQL", fn: (r) => fmtEur(cpsql(r)) },
  { key: "pipeline", label: "Pipeline €", fn: (r) => fmtEur(r.pipeline) },
  { key: "won", label: "Closed Won", fn: (r) => fmtEur(r.closedWon) },
  { key: "roi", label: "ROI", fn: (r) => fmtPct(roi(r)) },
];

export default function PaidPage() {
  const t = totals(mockCampaigns);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Paid Media Performance</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        Canal × campaña. País atribuido por <em>campaign group</em> en LinkedIn.
      </p>
      <StatusBanner />
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--panel)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-3">Canal</th>
              <th className="px-3 py-3">Campaña</th>
              <th className="px-3 py-3">Grupo</th>
              <th className="px-3 py-3">País</th>
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-3 text-right">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {mockCampaigns.map((r) => (
              <tr key={r.campaign} className="border-t border-[var(--border)]">
                <td className="px-3 py-3">{r.channel}</td>
                <td className="px-3 py-3 font-mono text-xs">{r.campaign}</td>
                <td className="px-3 py-3 text-xs text-[var(--muted)]">
                  {r.campaignGroup ?? "—"}
                </td>
                <td className="px-3 py-3">{r.country}</td>
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-3 text-right tabular-nums">
                    {c.fn(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-[var(--border)] bg-[var(--panel)] font-semibold">
            <tr>
              <td className="px-3 py-3" colSpan={4}>
                Total
              </td>
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-3 text-right tabular-nums">
                  {c.fn(t as CampaignRow)}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
