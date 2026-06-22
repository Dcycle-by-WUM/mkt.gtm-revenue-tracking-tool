"use client";

import { useState } from "react";
import { FilterBar } from "@/components/FilterBar";
import { PivotTable } from "@/components/PivotTable";
import {
  filterCampaigns,
  countriesOf,
  sumMetrics,
  emptyFilters,
  type CampaignRow,
} from "@/lib/mock-data";
import { fmtEur, fmtNum, fmtPct, roi, mqlRate, sqlRate } from "@/lib/kpis";

export function OverviewClient({ initial }: { initial: CampaignRow[] }) {
  const [filters, setFilters] = useState(emptyFilters);
  const rows = filterCampaigns(initial, filters);
  const t = sumMetrics(rows);

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
    <>
      <FilterBar filters={filters} setFilters={setFilters} countries={countriesOf(initial)} />

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{c.label}</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{c.value}</div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        Tabla dinámica
      </h2>
      <PivotTable rows={rows} />
    </>
  );
}
