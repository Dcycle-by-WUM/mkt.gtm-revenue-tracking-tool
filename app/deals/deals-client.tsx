"use client";

import { useState } from "react";
import { FilterBar } from "@/components/FilterBar";
import { emptyFilters } from "@/lib/mock-data";
import { regionOf, type CountryGroups } from "@/lib/regions";
import { fmtEur } from "@/lib/kpis";
import { leadCohort, type DealRow, type LeadCohort } from "@/lib/data/deals";

const COHORT_BADGE: Record<LeadCohort, string> = {
  "2026": "bg-[var(--good-bg)] text-[var(--good-text)]",
  "histórico": "bg-[var(--info-bg)] text-[var(--info-text)]",
  "sin contacto": "bg-[var(--subtle)] text-[var(--muted)]",
};

const COHORT_LABEL: Record<LeadCohort, string> = {
  "2026": "Lead 2026",
  "histórico": "Lead histórico",
  "sin contacto": "Sin contacto",
};

export function DealsClient({ initial, groups }: { initial: DealRow[]; groups: CountryGroups }) {
  const [filters, setFilters] = useState(emptyFilters);
  const [cohortFilter, setCohortFilter] = useState<"" | LeadCohort>("");

  const matchesBase = (r: DealRow) =>
    (!filters.region || regionOf(r.country, groups) === filters.region) &&
    (!filters.country || r.country === filters.country) &&
    (!filters.month || r.month === filters.month) &&
    (!filters.channel || r.channel === filters.channel);

  const rows = initial.filter((r) => matchesBase(r) && (!cohortFilter || leadCohort(r) === cohortFilter));

  const countries = [...new Set(initial.map((r) => r.country))].sort();
  const months = [...new Set(initial.map((r) => r.month))].sort();
  const channels = [...new Set(initial.map((r) => r.channel))].sort();

  // Tiles de cohorte: respetan región/país/mes/canal pero ignoran el filtro
  // de cohorte (son precisamente el desglose por cohorte).
  const tileRows = initial.filter(matchesBase);
  const byCohort = (c: LeadCohort) => tileRows.filter((r) => leadCohort(r) === c);
  const sumAmount = (rs: DealRow[]) => rs.reduce((a, r) => a + r.amount, 0);

  const tiles: { label: string; rows: DealRow[]; cohort?: LeadCohort }[] = [
    { label: "Pipeline total", rows: tileRows },
    { label: "De leads 2026", rows: byCohort("2026"), cohort: "2026" },
    { label: "De leads históricos", rows: byCohort("histórico"), cohort: "histórico" },
    { label: "Sin contacto asociado", rows: byCohort("sin contacto"), cohort: "sin contacto" },
  ];

  const sel = "rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm";

  return (
    <>
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        countries={countries}
        months={months}
        channels={channels}
        groups={groups}
      />

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        {tiles.map((t) => (
          <button
            key={t.label}
            onClick={() => setCohortFilter(t.cohort && cohortFilter !== t.cohort ? t.cohort : "")}
            className={`rounded-lg border p-5 text-left transition ${
              t.cohort && cohortFilter === t.cohort
                ? "border-[var(--accent)] bg-[var(--panel)]"
                : "border-[var(--border)] bg-[var(--panel)] hover:bg-[var(--subtle)]"
            }`}
          >
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{t.label}</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{fmtEur(sumAmount(t.rows))}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">{t.rows.length} deals</div>
          </button>
        ))}
      </div>

      <div className="mb-3 flex items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Cohorte del lead</span>
        <select className={sel} value={cohortFilter} onChange={(e) => setCohortFilter(e.target.value as "" | LeadCohort)}>
          <option value="">Todas</option>
          <option value="2026">Lead 2026 (esfuerzo mktg reciente)</option>
          <option value="histórico">Lead histórico (anterior a 2026)</option>
          <option value="sin contacto">Sin contacto asociado</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-[var(--subtle)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Deal</th>
              <th className="px-4 py-3">Mes</th>
              <th className="px-4 py-3">Pipeline HS</th>
              <th className="px-4 py-3">Canal</th>
              <th className="px-4 py-3">Campaña</th>
              <th className="px-4 py-3">País</th>
              <th className="px-4 py-3">Contacto creado</th>
              <th className="px-4 py-3">Cohorte</th>
              <th className="px-4 py-3 text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cohort = leadCohort(r);
              return (
                <tr key={r.dealId} className="border-t border-[var(--border)]">
                  <td className="px-4 py-2.5">
                    {r.dealname}
                    {r.isClosedWon && (
                      <span className="ml-2 rounded bg-[var(--good-bg)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--good-text)]">
                        Won
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{r.month}</td>
                  <td className="px-4 py-2.5">{r.pipelineLabel}</td>
                  <td className="px-4 py-2.5">{r.channel}</td>
                  <td className="px-4 py-2.5 text-[var(--muted)]">{r.campaign ?? "—"}</td>
                  <td className="px-4 py-2.5">{r.country}</td>
                  <td className="px-4 py-2.5 tabular-nums">{r.contactCreatedMonth ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${COHORT_BADGE[cohort]}`}>
                      {COHORT_LABEL[cohort]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtEur(r.amount)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-[var(--muted)]">
                  Sin deals para este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
