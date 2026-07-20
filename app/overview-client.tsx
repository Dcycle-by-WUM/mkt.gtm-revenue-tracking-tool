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
  currentYearStart,
  isPaidChannel,
  type CampaignRow,
  type Filters,
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
  // Arranca en el año en curso: la Overview ya no muestra la cola de años
  // viejos con 1-2 leads. Ajustable con el rango Desde/Hasta.
  const [filters, setFilters] = useState<Filters>(() => ({ ...emptyFilters, monthFrom: currentYearStart() }));
  const rows = filterCampaigns(initial, filters, groups);
  const t = sumMetrics(rows);
  const months = monthsOf(initial);
  const channels = [...new Set(initial.map((r) => r.channel))].sort();

  // Funnel mensual: respeta región/país/canal del filtro pero ignora el mes
  // — el mes es el eje de fila de estas tablas.
  const monthlyRows = filterCampaigns(initial, { ...filters, month: "" }, groups);
  const linkedinRows = monthlyRows.filter((r) => r.channel === "LinkedIn");
  const googleRows = monthlyRows.filter((r) => r.channel === "Google");
  const paidRows = monthlyRows.filter((r) => isPaidChannel(r.channel));
  const nonPaidRows = monthlyRows.filter((r) => !isPaidChannel(r.channel));
  // Canales no-paid presentes (Organic / Email Marketing / Otros), en orden
  // fijo, cada uno con su tabla de funnel mensual.
  const NON_PAID_ORDER = ["Organic", "Email Marketing", "Otros"] as const;
  const nonPaidByChannel = NON_PAID_ORDER
    .map((ch) => ({ channel: ch, rows: nonPaidRows.filter((r) => r.channel === ch) }))
    .filter((g) => g.rows.length > 0);

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
      {nonPaidByChannel.map((g) => (
        <MonthlyFunnelTable
          key={g.channel}
          title={g.channel === "Otros" ? "Otros (no-paid)" : g.channel}
          rows={g.rows}
        />
      ))}
      {nonPaidByChannel.length > 0 && (
        <ChannelTotalsTable
          title="No-paid Total"
          channelRows={nonPaidByChannel.map((g) => ({
            label: g.channel,
            metrics: sumMetrics(g.rows),
          }))}
        />
      )}
      {paidRows.length > 0 && nonPaidRows.length > 0 && (
        <ChannelTotalsTable
          title={`Total ${scopeLabel}`}
          channelRows={[
            { label: "Paid Media", metrics: sumMetrics(paidRows) },
            { label: "No-paid (inbound)", metrics: sumMetrics(nonPaidRows) },
          ]}
        />
      )}

      <h2 className="mb-3 mt-10 text-base font-semibold">Tabla dinámica</h2>
      <PivotTable rows={rows} />
    </>
  );
}
