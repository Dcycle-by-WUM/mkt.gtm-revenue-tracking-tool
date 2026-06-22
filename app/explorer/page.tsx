"use client";

import { useState } from "react";
import { PageHeader, Panel } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { FilterBar } from "@/components/FilterBar";
import { PivotTable } from "@/components/PivotTable";
import {
  mockCampaigns, applyOverrides, filterCampaigns, countriesOf,
  emptyFilters, NO_COUNTRY, OVERRIDES_KEY, type CountryOverrides,
} from "@/lib/mock-data";
import { useLocalState } from "@/lib/store";

// Explorer / Desglose libre — Brief §8.6. Pivot + corrección de país (§7.4).
const COUNTRY_OPTIONS = [NO_COUNTRY, "ES", "UK", "DE", "FR", "US", "MX"];

export default function ExplorerPage() {
  const [overrides, setOverrides] = useLocalState<CountryOverrides>(OVERRIDES_KEY, {});
  const [filters, setFilters] = useState(emptyFilters);

  const all = applyOverrides(mockCampaigns, overrides);
  const rows = filterCampaigns(all, filters);

  // Campañas que siguen sin país asignado (para revisarlas / corregirlas).
  const noCountry = [...new Map(all.filter((r) => r.country === NO_COUNTRY).map((r) => [r.campaign, r])).values()];

  const setCountry = (campaign: string, country: string) => {
    const next = { ...overrides };
    if (country === NO_COUNTRY) delete next[campaign];
    else next[campaign] = country;
    setOverrides(next);
  };

  return (
    <div>
      <PageHeader
        title="Explorer / Desglose libre (pivot)"
        subtitle="Pivota por Canal / País / Campaña / Mes con los filtros aplicados. Revisa y corrige las campañas sin país."
      />
      <StatusBanner />
      <FilterBar filters={filters} setFilters={setFilters} countries={countriesOf(all)} />

      <PivotTable rows={rows} initialDims={["country"]} />

      <div className="mt-8">
        <Panel title={`Campañas sin país / Multi (${noCountry.length})`}>
          {noCountry.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Todas las campañas tienen país asignado. 🎉</p>
          ) : (
            <div className="space-y-2">
              <p className="mb-2 text-sm text-[var(--muted)]">
                Asigna un país; el cambio se aplica en todas las pantallas (override §7.4).
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
            <button onClick={() => setOverrides({})} className="mt-3 text-xs text-[var(--muted)] underline">
              Deshacer todas las asignaciones
            </button>
          )}
        </Panel>
      </div>
    </div>
  );
}
