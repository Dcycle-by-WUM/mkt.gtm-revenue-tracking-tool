"use client";

import { useState, useTransition } from "react";
import { actionSetCountryGroup } from "@/app/actions";
import type { CountryGroups } from "@/lib/regions";

// Editor de grupos de países (regiones de negocio). Cada país apunta a un
// grupo libre — Spain, DACH, Rest of International o el que el equipo
// invente. Los filtros de todas las pantallas agrupan por esto.
export function RegionGroupsEditor({ initial }: { initial: CountryGroups }) {
  const [groups, setGroups] = useState(initial);
  const [newCountry, setNewCountry] = useState("");
  const [newGroup, setNewGroup] = useState("");
  const [, startTransition] = useTransition();

  const groupNames = [...new Set(Object.values(groups))].sort();

  const save = (country: string, group: string) => {
    if (!country.trim() || !group.trim()) return;
    setGroups((g) => ({ ...g, [country.trim().toUpperCase()]: group.trim() }));
    startTransition(() => {
      void actionSetCountryGroup(country.trim().toUpperCase(), group.trim());
    });
  };

  return (
    <div>
      <p className="mb-3 text-xs text-[var(--muted)]">
        Región de cada país para filtros y agregados (Spain, DACH, Rest of
        International…). Un país sin fila cae en “Rest of International”.
      </p>
      <datalist id="region-group-options">
        {groupNames.map((g) => <option key={g} value={g} />)}
      </datalist>
      <div className="space-y-1">
        {Object.entries(groups)
          .sort(([, a], [, b]) => a.localeCompare(b))
          .map(([country, group]) => (
            <div key={country} className="flex items-center gap-2 border-b border-[var(--border)] py-1.5 last:border-0">
              <span className="w-12 font-mono text-xs">{country}</span>
              <input
                className="control flex-1"
                defaultValue={group}
                list="region-group-options"
                onBlur={(e) => e.target.value !== group && save(country, e.target.value)}
              />
            </div>
          ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <input
          className="control w-20"
          placeholder="País"
          value={newCountry}
          onChange={(e) => setNewCountry(e.target.value.toUpperCase())}
          maxLength={3}
        />
        <input
          className="control flex-1"
          placeholder="Grupo (ej. DACH)"
          value={newGroup}
          list="region-group-options"
          onChange={(e) => setNewGroup(e.target.value)}
        />
        <button
          className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          disabled={!newCountry.trim() || !newGroup.trim()}
          onClick={() => {
            save(newCountry, newGroup);
            setNewCountry("");
            setNewGroup("");
          }}
        >
          Añadir
        </button>
      </div>
    </div>
  );
}
