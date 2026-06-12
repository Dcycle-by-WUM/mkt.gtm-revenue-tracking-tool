import { StatusBanner } from "@/components/StatusBanner";
import { mockCampaigns, totals } from "@/lib/mock-data";
import { fmtEur, fmtNum, fmtPct, roi, mqlRate, sqlRate } from "@/lib/kpis";

// Overview "Cómo vamos" — Brief §8.2. North-star del funnel paid.
export default function OverviewPage() {
  const t = totals(mockCampaigns);

  const cards = [
    { label: "Spend", value: fmtEur(t.spend) },
    { label: "Leads", value: fmtNum(t.leads) },
    { label: "MQL", value: fmtNum(t.mql) },
    { label: "SQL", value: fmtNum(t.sql) },
    { label: "Pipeline €", value: fmtEur(t.pipeline) },
    { label: "Closed Won", value: fmtEur(t.closedWon) },
    { label: "ROI", value: fmtPct(roi(t)) },
    { label: "% MQL/Lead", value: fmtPct(mqlRate(t)) },
    { label: "% SQL/MQL", value: fmtPct(sqlRate(t)) },
  ];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Overview — Cómo vamos</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        Funnel paid unificado: Spend → Leads → MQL → SQL → Pipeline → Closed Won.
      </p>
      <StatusBanner />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5"
          >
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">
              {c.label}
            </div>
            <div className="mt-2 text-2xl font-semibold">{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
