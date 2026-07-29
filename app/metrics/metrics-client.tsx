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
  groupBy,
  emptyFilters,
  currentYearStart,
  isPaidChannel,
  type CampaignRow,
  type Filters,
} from "@/lib/mock-data";
import type { CountryGroups } from "@/lib/regions";
import { fmtEur, fmtNum, fmtPct, roi, mqlRate, sqlRate } from "@/lib/kpis";
import { Donut } from "@/components/ui/charts";

// Color de marca por canal (paleta dataviz), coherente en toda la pantalla.
const CH_COLOR: Record<string, string> = {
  LinkedIn: "var(--chart-1)",
  Google: "var(--chart-2)",
  Organic: "var(--chart-4)",
  "Email Marketing": "var(--chart-5)",
  Otros: "var(--chart-6)",
};

export function MetricsClient({
  initial,
  groups,
}: {
  initial: CampaignRow[];
  groups: CountryGroups;
}) {
  // Arranca en el año en curso: esta vista ya no muestra la cola de años
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

  // Datos para las gráficas de comprensión (respetan el filtro actual).
  const byChannel = groupBy(rows, "channel").map(([name, m]) => ({ name, m }));
  const spendByChannel = byChannel
    .filter((c) => c.m.spend > 0)
    .map((c) => ({ label: c.name, value: c.m.spend, color: CH_COLOR[c.name] ?? "var(--chart-3)" }));
  const pipeByChannel = byChannel
    .filter((c) => c.m.pipeline > 0)
    .sort((a, b) => b.m.pipeline - a.m.pipeline);
  const maxPipe = Math.max(1, ...pipeByChannel.map((c) => c.m.pipeline));

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

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{c.label}</div>
            <div className="mt-1.5 text-xl font-semibold tabular-nums">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Gráficas de comprensión: embudo + reparto de spend + pipeline por canal. */}
      <div className="mb-8 grid gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold">Embudo · {scopeLabel}</h3>
          <FunnelMini leads={t.leads} mql={t.mql} sql={t.sql} pipeline={t.pipeline} />
        </div>
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold">Spend por canal</h3>
          {spendByChannel.length > 0 ? (
            <Donut data={spendByChannel} formatValue={(v) => fmtEur(v)} />
          ) : (
            <p className="py-6 text-center text-sm text-[var(--muted)]">Sin gasto en este filtro.</p>
          )}
        </div>
        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold">Pipeline por canal</h3>
          {pipeByChannel.length > 0 ? (
            <div className="space-y-3">
              {pipeByChannel.map((c) => (
                <div key={c.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{c.name}</span>
                    <span className="tabular-nums text-[var(--muted)]">{fmtEur(c.m.pipeline)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--subtle)]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(c.m.pipeline / maxPipe) * 100}%`, background: CH_COLOR[c.name] ?? "var(--chart-3)" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-[var(--muted)]">Sin pipeline en este filtro.</p>
          )}
        </div>
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

// Embudo Lead → MQL → SQL con % de conversión entre etapas + pipeline al final.
function FunnelMini({ leads, mql, sql, pipeline }: { leads: number; mql: number; sql: number; pipeline: number }) {
  const steps = [
    { label: "Leads", value: leads },
    { label: "MQL", value: mql },
    { label: "SQL", value: sql },
  ];
  const max = Math.max(1, leads);
  return (
    <div className="space-y-2.5">
      {steps.map((s, i) => {
        const prev = i === 0 ? null : steps[i - 1].value;
        const conv = prev && prev > 0 ? s.value / prev : null;
        return (
          <div key={s.label} className="flex items-center gap-3">
            <span className="w-12 shrink-0 text-xs uppercase tracking-wide text-[var(--muted)]">{s.label}</span>
            <div className="h-6 flex-1 overflow-hidden rounded-md bg-[var(--subtle)]">
              <div
                className="flex h-full items-center rounded-md bg-[var(--chart-1)] px-2 text-xs font-medium text-white"
                style={{ width: `${Math.max((s.value / max) * 100, 8)}%` }}
              >
                {fmtNum(s.value)}
              </div>
            </div>
            <span className="w-14 shrink-0 text-right text-xs tabular-nums text-[var(--muted)]">
              {conv === null ? "—" : `${fmtPct(conv)}`}
            </span>
          </div>
        );
      })}
      <div className="flex items-center justify-between border-t border-[var(--border)] pt-3 text-sm">
        <span className="text-[var(--muted)]">Pipeline €</span>
        <span className="font-semibold tabular-nums text-[var(--brand)]">{fmtEur(pipeline)}</span>
      </div>
    </div>
  );
}
