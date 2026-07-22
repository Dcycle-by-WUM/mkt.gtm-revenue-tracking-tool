"use client";

import { useMemo, useState, useTransition } from "react";
import { actionSetCampaignAlias } from "@/app/actions";
import type { CampaignOption } from "@/lib/data/campaigns";

// Cuántas sugerencias se muestran a la vez — el objetivo es que la lista
// quepa de un vistazo, no volcar las cientos de campañas del <select> viejo.
const MAX_SUGGESTIONS = 20;

function campaignLabel(c: CampaignOption): string {
  return `${c.source} · ${c.name}${c.country ? ` (${c.country})` : ""}`;
}

// Combobox de búsqueda por nombre: escribe y filtra, en vez del <select>
// nativo con todas las campañas de golpe (incómodo con cientos de opciones).
function CampaignPicker({
  campaigns,
  value,
  onChange,
}: {
  campaigns: CampaignOption[];
  value: CampaignOption | null;
  onChange: (c: CampaignOption | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q ? campaigns.filter((c) => c.name.toLowerCase().includes(q)) : campaigns;
    return pool.slice(0, MAX_SUGGESTIONS);
  }, [campaigns, query]);

  if (value) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs">
        <span className="min-w-0 flex-1 truncate">{campaignLabel(value)}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="shrink-0 text-[var(--muted)] hover:text-[var(--text)]"
          title="Cambiar campaña"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        className="w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
        placeholder="Buscar campaña por nombre…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--panel)] text-left shadow-lg">
          {matches.length === 0 ? (
            <li className="px-2 py-1.5 text-xs text-[var(--muted)]">Sin resultados para &quot;{query}&quot;.</li>
          ) : (
            matches.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  // onMouseDown antes que el onBlur del input, para que el click no se pierda.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(c);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="block w-full truncate px-2 py-1.5 text-left text-xs hover:bg-[var(--subtle)]"
                >
                  {campaignLabel(c)}
                </button>
              </li>
            ))
          )}
          {matches.length === MAX_SUGGESTIONS && (
            <li className="border-t border-[var(--border)] px-2 py-1 text-[10px] text-[var(--muted)]">
              Sigue escribiendo para acotar más.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export function UnmatchedUtmResolver({
  utms,
  campaigns,
}: {
  utms: string[];
  campaigns: CampaignOption[];
}) {
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const pending = utms.filter((u) => !resolved.has(u));

  const save = (utm: string) => {
    const campaignId = selection[utm];
    if (!campaignId) return;
    setSaving(utm);
    startTransition(async () => {
      await actionSetCampaignAlias(utm, campaignId);
      setResolved((prev) => new Set(prev).add(utm));
      setSaving(null);
    });
  };

  if (pending.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No hay UTMs sin resolver.</p>;
  }

  return (
    <ul className="space-y-2">
      {pending.map((u) => {
        const selected = campaigns.find((c) => c.id === selection[u]) ?? null;
        return (
          <li key={u} className="border-b border-[var(--border)] pb-2 last:border-0">
            <div className="mb-1.5 break-all font-mono text-xs">{u}</div>
            <div className="flex items-center gap-2">
              <CampaignPicker
                campaigns={campaigns}
                value={selected}
                onChange={(c) => setSelection((s) => ({ ...s, [u]: c?.id ?? "" }))}
              />
              <button
                disabled={saving === u || !selection[u]}
                onClick={() => save(u)}
                className="shrink-0 rounded-md bg-[var(--accent)]/20 px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--accent)]/30 disabled:opacity-50"
              >
                {saving === u ? "Guardando…" : "Guardar alias"}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
