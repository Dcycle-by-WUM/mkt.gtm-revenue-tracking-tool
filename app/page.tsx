"use client";

import { useState } from "react";
import { PageHeader } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { FilterBar } from "@/components/FilterBar";
import { PivotTable } from "@/components/PivotTable";
import {
  mockCampaigns, applyOverrides, filterCampaigns, countriesOf, sumMetrics,
  emptyFilters, OVERRIDES_KEY, type CountryOverrides,
} from "@/lib/mock-data";
import { fmtEur, fmtNum, fmtPct, roi, mqlRate, sqlRate } from "@/lib/kpis";
import { useLocalState } from "@/lib/store";

// Overview "Cómo vamos" — Brief §8.2. Filtros país/mes + tabla dinámica.
export default function OverviewPage() {
  const [overrides] = useLocalState<CountryOverrides>(OVERRIDES_KEY, {});
  const [filters, setFilters] = useState(emptyFilters);

  const all = applyOverrides(mockCampaigns, overrides);
  const rows = filterCampaigns(all, filters);
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
    <div>
      <PageHeader
        title="Overview — Cómo vamos"
        subtitle="Funnel paid unificado. Filtra por país/mes y monta tablas dinámicas que se recalculan solas."
      />
      <StatusBanner />
      <FilterBar filters={filters} setFilters={setFilters} countries={countriesOf(all)} />

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
    </div>
  );
}
