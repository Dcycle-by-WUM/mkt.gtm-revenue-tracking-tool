"use client";

import { useState } from "react";
import { FilterBar } from "@/components/FilterBar";
import { PivotTable } from "@/components/PivotTable";
import { MonthlyFunnelTable, ChannelTotalsTable } from "@/components/MonthlyFunnelTable";
import {
  filterCampaigns,
  countriesOf,
  monthsOf,
  sumMetrics,
  emptyFilters,
  type CampaignRow,
} from "@/lib/mock-data";
import { fmtEur, fmtNum, fmtPct, roi, mqlRate, sqlRate } from "@/lib/kpis";

export function OverviewClient({ initial }: { initial: CampaignRow[] }) {
  const [filters, setFilters] = useState(emptyFilters);
  const rows = filterCampaigns(initial, filters);
  const t = sumMetrics(rows);
  const months = monthsOf(initial);
  const channels = [...new Set(initial.map((r) => r.channel))].sort();

  // Funnel mensual: respeta país + canal del filtro pero ignora el mes — el
  // mes es el eje de fila de estas tablas, filtrarlo las dejaría en 1 fila.
  const monthlyRows = filterCampaigns(initial, { ...filters, month: "" });
  const linkedinRows = monthlyRows.filter((r) => r.channel === "LinkedIn");
  const googleRows = monthlyRows.filter((r) => r.channel === "Google");
  const organicRows = monthlyRows.filter((r) => r.channel === "Otros");

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
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        countries={countriesOf(initial)}
        months={months}
        channels={channels}
      />

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{c.label}</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{c.value}</div>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        Funnel mensual por canal
      </h2>
      <p className="mb-4 text-xs text-[var(--muted)]">
        Respeta el filtro de país/canal de arriba; el mes es la fila de estas
        tablas, así que el filtro de mes no aplica aquí.
      </p>
      <MonthlyFunnelTable title="LinkedIn Ads" rows={linkedinRows} />
      <MonthlyFunnelTable title="Google Ads" rows={googleRows} />
      <MonthlyFunnelTable title="Orgánico" rows={organicRows} />
      {(linkedinRows.length > 0 || googleRows.length > 0) && (
        <ChannelTotalsTable
          title="Paid Media Total"
          channelRows={[
            { label: "LinkedIn Ads", metrics: sumMetrics(linkedinRows) },
            { label: "Google Ads", metrics: sumMetrics(googleRows) },
          ]}
        />
      )}

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        Tabla dinámica
      </h2>
      <PivotTable rows={rows} />
    </>
  );
}
