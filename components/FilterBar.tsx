"use client";

import { MONTHS, CHANNELS, type Filters } from "@/lib/mock-data";
import { regionOf, regionsOf, type CountryGroups } from "@/lib/regions";

// Barra de filtros global: región (segmented) + país / mes / canal.
// `groups` activa la capa de regiones (Spain / DACH / Rest of Intl…): el
// segmented filtra por grupo y el dropdown de país se acota a los países de
// la región elegida. `countries` debe venir ya acotado a países con
// actividad paid (paidCountriesOf) — la cola larga de países orgánicos se
// alcanza por región, no por el dropdown.
export function FilterBar({
  filters,
  setFilters,
  countries,
  months,
  channels,
  groups,
  showChannel = true,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  countries: string[];
  months?: readonly string[];
  channels?: readonly string[];
  groups?: CountryGroups;
  showChannel?: boolean;
}) {
  const monthOpts = months && months.length > 0 ? months : MONTHS;
  const channelOpts = channels && channels.length > 0 ? channels : CHANNELS;

  const regions = groups ? regionsOf(countries, groups) : [];
  const countryOpts =
    groups && filters.region
      ? countries.filter((c) => regionOf(c, groups) === filters.region)
      : countries;

  const hasFilters = filters.country || filters.month || filters.channel || filters.region;

  return (
    <div className="mb-6 space-y-3">
      {groups && regions.length > 0 && (
        <div className="flex w-fit flex-wrap items-center gap-1 rounded-lg bg-[var(--subtle)] p-1">
          <RegionTab
            label="Todas las regiones"
            active={!filters.region}
            onClick={() => setFilters({ ...filters, region: "", country: "" })}
          />
          {regions.map((g) => (
            <RegionTab
              key={g}
              label={g}
              active={filters.region === g}
              onClick={() => setFilters({ ...filters, region: g, country: "" })}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select className="control" value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value })}>
          <option value="">{filters.region ? `Países de ${filters.region}` : "Todos los países"}</option>
          {countryOpts.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <select className="control" value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })}>
          <option value="">Todos los meses</option>
          {monthOpts.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        {showChannel && (
          <select className="control" value={filters.channel} onChange={(e) => setFilters({ ...filters, channel: e.target.value })}>
            <option value="">Todos los canales</option>
            {channelOpts.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        )}

        {hasFilters && (
          <button
            onClick={() => setFilters({ country: "", month: "", channel: "", region: "" })}
            className="rounded-lg px-3 py-1.5 text-sm text-[var(--muted)] hover:bg-[var(--subtle)]"
          >
            Limpiar
          </button>
        )}
      </div>
    </div>
  );
}

function RegionTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
        active
          ? "bg-[var(--panel)] font-medium text-[var(--text)] shadow-sm"
          : "text-[var(--muted)] hover:text-[var(--text)]"
      }`}
    >
      {label}
    </button>
  );
}
