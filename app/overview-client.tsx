"use client";

import { useState } from "react";
import { FilterBar } from "@/components/FilterBar";
import { PivotTable } from "@/components/PivotTable";
import { MonthlyFunnelTable, ChannelTotalsTable } from "@/components/MonthlyFunnelTable";
import {
  filterCampaigns,
  paidCountriesOf,
  monthsOf,
  sumMetrics,
  emptyFilters,
  type CampaignRow,
} from "@/lib/mock-data";
import type { CountryGroups } from "@/lib/regions";
import { fmtEur, fmtNum, fmtPct, roi, mqlRate, sqlRate } from "@/lib/kpis";

export function OverviewClient({
  initial,
  groups,
}: {
  initial: CampaignRow[];
  groups: CountryGroups;
}) {
  const [filters, setFilters] = useState(emptyFilters);
  const rows = filterCampaigns(initial, filters, groups);
  const t = sumMetrics(rows);
  const months = monthsOf(initial);
  const channels = [...new Set(initial.map((r) => r.channel))].sort();

  // Funnel mensual: respeta región/país/canal del filtro pero ignora el mes
  // — el mes es el eje de fila de estas tablas.
  const monthlyRows = filterCampaigns(initial, { ...filters, month: "" }, groups);
  const linkedinRows = monthlyRows.filter((r) => r.channel === "LinkedIn");
  const googleRows = monthlyRows.filter((r) => r.channel === "Google");
  const paidRows = monthlyRows.filter((r) => r.channel !== "Otros");
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

  const scopeLabel = filters.country || filters.region || "Todas las regiones";

  return (
    <>
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        countries={paidCountriesOf(initial)}
        months={months}
        channels={channels}
        groups={groups}
      />

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{c.label}</div>
            <div className="mt-1.5 text-xl font-semibold tabular-nums">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Bloques mensuales — mismo orden que la hoja FORECASTS (METRICAS):
          LinkedIn → Google → Paid Total → Orgánico → Total. */}
      <h2 className="mb-1 mt-8 text-base font-semibold">
        Métricas — {scopeLabel}
      </h2>
      <p className="mb-4 text-xs text-[var(--muted)]">
        Respeta región/país/canal del filtro; el mes es la fila de estas
        tablas, así que el filtro de mes no aplica aquí.
      </p>
      <MonthlyFunnelTable title="LinkedIn Ads" rows={linkedinRows} />
      <MonthlyFunnelTable title="Google Ads" rows={googleRows} />
      {(linkedinRows.length > 0 || googleRows.length > 0) && (
        <ChannelTotalsTable
          title="Paid Media Total"
          channelRows={[
            { label: "LinkedIn Ads", metrics: sumMetrics(linkedinRows) },
            { label: "Google Ads", metrics: sumMetrics(googleRows) },
          ]}
        />
      )}
      <MonthlyFunnelTable title="Orgánico (demo requests)" rows={organicRows} />
      {paidRows.length > 0 && organicRows.length > 0 && (
        <ChannelTotalsTable
          title={`Total ${scopeLabel}`}
          channelRows={[
            { label: "Paid Media", metrics: sumMetrics(paidRows) },
            { label: "Orgánico", metrics: sumMetrics(organicRows) },
          ]}
        />
      )}

      <h2 className="mb-3 mt-10 text-base font-semibold">Tabla dinámica</h2>
      <PivotTable rows={rows} />
    </>
  );
}
