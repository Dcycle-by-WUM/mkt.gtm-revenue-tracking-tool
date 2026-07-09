"use client";

import { useState, useTransition } from "react";
import { actionSetCampaignAlias } from "@/app/actions";
import type { CampaignOption } from "@/lib/data/campaigns";

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
  const [campaignSearch, setCampaignSearch] = useState("");
  const [, startTransition] = useTransition();

  const pending = utms.filter((u) => !resolved.has(u));
  const visibleCampaigns = campaignSearch.trim()
    ? campaigns.filter((c) => c.name.toLowerCase().includes(campaignSearch.trim().toLowerCase()))
    : campaigns;

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
    <div>
      <input
        className="control mb-3 w-full"
        placeholder={`Filtrar las ${campaigns.length} campañas del selector…`}
        value={campaignSearch}
        onChange={(e) => setCampaignSearch(e.target.value)}
      />
    <ul className="space-y-2">
      {pending.map((u) => (
        <li key={u} className="border-b border-[var(--border)] pb-2 last:border-0">
          <div className="mb-1.5 break-all font-mono text-xs">{u}</div>
          <div className="flex items-center gap-2">
            <select
              className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
              value={selection[u] ?? ""}
              onChange={(e) => setSelection((s) => ({ ...s, [u]: e.target.value }))}
            >
              <option value="">Asignar a campaña…</option>
              {visibleCampaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.source} · {c.name} {c.country ? `(${c.country})` : ""}
                </option>
              ))}
            </select>
            <button
              disabled={saving === u || !selection[u]}
              onClick={() => save(u)}
              className="shrink-0 rounded-md bg-[var(--accent)]/20 px-2 py-1 text-xs text-[var(--accent)] hover:bg-[var(--accent)]/30 disabled:opacity-50"
            >
              {saving === u ? "Guardando…" : "Guardar alias"}
            </button>
          </div>
        </li>
      ))}
    </ul>
    </div>
  );
}
