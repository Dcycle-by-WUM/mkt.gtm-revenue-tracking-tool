"use client";

import { MONTHS, CHANNELS, type Filters } from "@/lib/mock-data";

// Barra de filtros global por país / mes / canal. Reutilizable en cada pantalla.
// `months`: si se pasa, sustituye al hardcoded MONTHS. Sirve para que el filtro
//           muestre solo los meses presentes en el dataset (Dec → Jun cuando
//           hay datos reales, vs el mock de abr/may/jun).
export function FilterBar({
  filters,
  setFilters,
  countries,
  months,
  channels,
  showChannel = true,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  countries: string[];
  months?: readonly string[];
  channels?: readonly string[];
  showChannel?: boolean;
}) {
  const sel = "rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm";
  const monthOpts = months && months.length > 0 ? months : MONTHS;
  const channelOpts = channels && channels.length > 0 ? channels : CHANNELS;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-3">
      <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Filtros</span>

      <select className={sel} value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value })}>
        <option value="">Todos los países</option>
        {countries.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>

      <select className={sel} value={filters.month} onChange={(e) => setFilters({ ...filters, month: e.target.value })}>
        <option value="">Todos los meses</option>
        {monthOpts.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>

      {showChannel && (
        <select className={sel} value={filters.channel} onChange={(e) => setFilters({ ...filters, channel: e.target.value })}>
          <option value="">Todos los canales</option>
          {channelOpts.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}

      {(filters.country || filters.month || filters.channel) && (
        <button
          onClick={() => setFilters({ country: "", month: "", channel: "" })}
          className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-[var(--muted)] hover:bg-white/10"
        >
          Limpiar
        </button>
      )}
    </div>
  );
}
