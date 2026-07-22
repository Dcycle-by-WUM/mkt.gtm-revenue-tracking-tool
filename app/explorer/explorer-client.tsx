"use client";

import { useState, useTransition } from "react";
import { Panel } from "@/components/Page";
import { FilterBar } from "@/components/FilterBar";
import { MatrixTable } from "@/components/MatrixTable";
import { SavedViews } from "@/components/SavedViews";
import {
  filterCampaigns, paidCountriesOf, monthsOf, emptyFilters, currentYearStart, NO_COUNTRY, isPaidChannel,
  applyOverrides, type CampaignRow, type CountryOverrides, type Dimension, type Filters, type MetricKey,
} from "@/lib/mock-data";
import type { CountryGroups } from "@/lib/regions";
import { actionSetCountryOverride, actionClearCountryOverride } from "@/app/actions";

const COUNTRY_OPTIONS = [NO_COUNTRY, "ES", "UK", "DE", "FR", "US", "MX", "IT"];

// "Multi" es el país que escriben los parsers de LinkedIn/Google Ads cuando
// el nombre de campaña no trae país reconocible (o lo anuncia a propósito:
// INT genérico, EUROPA…) — un literal distinto de NO_COUNTRY ("Sin país /
// Multi", el sentinel para country_parsed nulo). El panel de abajo se llama
// "sin país / Multi" así que tiene que enseñar las dos cosas.
const MULTI_COUNTRY = "Multi";

// Estado guardable de la vista (filtros + configuración de la matriz).
type ExplorerView = { filters: Filters; rowDim: Dimension; metric: MetricKey };

export function ExplorerClient({
  campaigns: initialCampaigns,
  groups,
  overrides: initialOverrides,
}: {
  campaigns: CampaignRow[];
  groups: CountryGroups;
  overrides: CountryOverrides;
}) {
  const [overrides, setOverrides] = useState(initialOverrides);
  // Arranca en el año en curso para no ver la cola de años viejos.
  const [filters, setFilters] = useState<Filters>(() => ({ ...emptyFilters, monthFrom: currentYearStart() }));
  const [rowDim, setRowDim] = useState<Dimension>("country");
  const [metric, setMetric] = useState<MetricKey>("pipeline");
  const [, startTransition] = useTransition();

  const loadView = (v: ExplorerView) => {
    setFilters(v.filters);
    setRowDim(v.rowDim);
    setMetric(v.metric);
  };

  const all = applyOverrides(initialCampaigns, overrides);
  const rows = filterCampaigns(all, filters, groups);
  const noCountry = [...new Map(
    all
      .filter((r) => isPaidChannel(r.channel) && (r.country === NO_COUNTRY || r.country === MULTI_COUNTRY))
      .map((r) => [r.campaign, r]),
  ).values()];

  const setCountry = (campaign: string, country: string) => {
    setOverrides((cur) => {
      const next = { ...cur };
      if (country === NO_COUNTRY) delete next[campaign];
      else next[campaign] = country;
      return next;
    });
    startTransition(() => {
      void (country === NO_COUNTRY
        ? actionClearCountryOverride(campaign)
        : actionSetCountryOverride(campaign, country));
    });
  };

  const clearAll = () => {
    const keys = Object.keys(overrides);
    setOverrides({});
    startTransition(() => {
      for (const k of keys) void actionClearCountryOverride(k);
    });
  };

  return (
    <>
      <SavedViews<ExplorerView>
        storageKey="dcycle.explorer.views"
        current={{ filters, rowDim, metric }}
        onLoad={loadView}
      />
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        countries={paidCountriesOf(all)}
        months={monthsOf(all)}
        channels={[...new Set(all.map((r) => r.channel))].sort()}
        groups={groups}
      />

      <h2 className="mb-2 text-base font-semibold">Comparación por mes</h2>
      <p className="mb-3 text-xs text-[var(--muted)]">
        Una métrica, {rowDim === "country" ? "país" : rowDim === "channel" ? "canal" : "campaña"} en filas y
        meses en columnas, con totales. Cambia dimensión/métrica y el rango de meses arriba.
      </p>
      <MatrixTable rows={rows} rowDim={rowDim} metric={metric} onRowDim={setRowDim} onMetric={setMetric} />

      <div className="mt-8">
        <Panel title={`Campañas sin país / Multi (${noCountry.length})`}>
          {noCountry.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Todas las campañas tienen país asignado. 🎉</p>
          ) : (
            <div className="space-y-2">
              <p className="mb-2 text-sm text-[var(--muted)]">
                Asigna un país; el override se aplica en todas las pantallas y se guarda en Supabase como pattern.
              </p>
              {noCountry.map((r) => (
                <div key={r.campaign} className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-2 last:border-0">
                  <div>
                    <span className="font-mono text-xs">{r.campaign}</span>
                    <span className="ml-2 text-xs text-[var(--muted)]">{r.channel}</span>
                  </div>
                  <select
                    className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
                    value={overrides[r.campaign] ?? NO_COUNTRY}
                    onChange={(e) => setCountry(r.campaign, e.target.value)}
                  >
                    {COUNTRY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}
          {Object.keys(overrides).length > 0 && (
            <button onClick={clearAll} className="mt-3 text-xs text-[var(--muted)] underline">
              Deshacer todos los overrides
            </button>
          )}
        </Panel>
      </div>
    </>
  );
}
