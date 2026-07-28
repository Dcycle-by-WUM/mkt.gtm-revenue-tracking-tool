"use client";

import { Globe, CalendarRange, Layers, X, SlidersHorizontal } from "lucide-react";
import { MONTHS, CHANNELS, type Filters } from "@/lib/mock-data";
import { regionOf, regionsOf, type CountryGroups } from "@/lib/regions";

// Barra de filtros global: región (segmented) + país / rango de meses / canal.
// `groups` activa la capa de regiones (Spain / DACH / Rest of Intl…): el
// segmented filtra por grupo y el dropdown de país se acota a la región elegida.
// `countries` debe venir ya acotado a países con actividad paid.
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

  const hasFilters =
    !!(filters.country || filters.month || filters.channel || filters.region || filters.monthFrom || filters.monthTo);

  const clearAll = () =>
    setFilters({ country: "", month: "", channel: "", region: "", monthFrom: "", monthTo: "" });

  // Chips de filtros activos (quitar individual).
  const chips: { label: string; clear: () => void }[] = [];
  if (filters.region) chips.push({ label: filters.region, clear: () => setFilters({ ...filters, region: "", country: "" }) });
  if (filters.country) chips.push({ label: filters.country, clear: () => setFilters({ ...filters, country: "" }) });
  if (filters.monthFrom) chips.push({ label: `desde ${filters.monthFrom}`, clear: () => setFilters({ ...filters, monthFrom: "" }) });
  if (filters.monthTo) chips.push({ label: `hasta ${filters.monthTo}`, clear: () => setFilters({ ...filters, monthTo: "" }) });
  if (filters.channel) chips.push({ label: filters.channel, clear: () => setFilters({ ...filters, channel: "" }) });

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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--muted)]">
          <SlidersHorizontal className="h-3.5 w-3.5" /> Filtros
        </span>

        <Field icon={<Globe className="h-3.5 w-3.5" />}>
          <select
            className="control pr-8"
            value={filters.country}
            onChange={(e) => setFilters({ ...filters, country: e.target.value })}
          >
            <option value="">{filters.region ? `Países de ${filters.region}` : "Todos los países"}</option>
            {countryOpts.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>

        <Field icon={<CalendarRange className="h-3.5 w-3.5" />} label="Rango">
          <select
            className="control"
            value={filters.monthFrom}
            onChange={(e) => setFilters({ ...filters, monthFrom: e.target.value })}
          >
            <option value="">inicio</option>
            {monthOpts.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <span className="text-xs text-[var(--faint)]">→</span>
          <select
            className="control"
            value={filters.monthTo}
            onChange={(e) => setFilters({ ...filters, monthTo: e.target.value })}
          >
            <option value="">hoy</option>
            {monthOpts.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </Field>

        {showChannel && (
          <Field icon={<Layers className="h-3.5 w-3.5" />}>
            <select
              className="control"
              value={filters.channel}
              onChange={(e) => setFilters({ ...filters, channel: e.target.value })}
            >
              <option value="">Todos los canales</option>
              {channelOpts.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>
        )}

        {hasFilters && (
          <button
            onClick={clearAll}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-[var(--muted)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--text)]"
          >
            <X className="h-3.5 w-3.5" /> Limpiar
          </button>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <button
              key={c.label}
              onClick={c.clear}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--accent)] transition-colors hover:brightness-95"
            >
              {c.label}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label?: string; children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-[var(--faint)]">{icon}</span>
      {label && <span className="text-xs text-[var(--muted)]">{label}</span>}
      {children}
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
