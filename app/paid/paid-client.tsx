"use client";

import { useState, useTransition } from "react";
import { FilterBar } from "@/components/FilterBar";
import {
  filterCampaigns, paidCountriesOf, monthsOf, sumMetrics, emptyMetrics,
  emptyFilters, type CampaignRow,
} from "@/lib/mock-data";
import type { CountryGroups } from "@/lib/regions";
import { fmtEur, fmtNum, fmtPct, ctr, cpc, cpm, cpl, cpmql, cpsql, roi, type ChannelMetrics } from "@/lib/kpis";
import { actionSetCampaignTags } from "@/app/actions";
import { Tooltip } from "@/components/ui/Tooltip";

// Orígenes del dato para los tooltips de cabecera.
const PAID = "De Supermetrics (LinkedIn Ads + Google Ads).";
const CRM = "Del CRM (HubSpot), atribuido por utm_campaign.";
const MIX = "Cruza coste (Supermetrics) con volumen (HubSpot).";

type AggRow = ChannelMetrics & { campaign: string; channel: string; campaignGroup: string | null; country: string };

function aggregateByCampaign(rows: CampaignRow[]): AggRow[] {
  const map = new Map<string, AggRow>();
  for (const r of rows) {
    const cur = map.get(r.campaign) ?? {
      ...emptyMetrics(), campaign: r.campaign, channel: r.channel, campaignGroup: r.campaignGroup, country: r.country,
    };
    cur.spend += r.spend; cur.impressions += r.impressions; cur.clicks += r.clicks;
    cur.leads += r.leads; cur.mql += r.mql; cur.sql += r.sql;
    cur.pipeline += r.pipeline; cur.closedWon += r.closedWon;
    map.set(r.campaign, cur);
  }
  return [...map.values()].sort((a, b) => b.spend - a.spend);
}

const cols: { label: string; help: string; fn: (r: ChannelMetrics) => string }[] = [
  { label: "Spend", help: PAID, fn: (r) => fmtEur(r.spend) },
  { label: "Impr.", help: PAID, fn: (r) => fmtNum(r.impressions) },
  { label: "Clics", help: PAID, fn: (r) => fmtNum(r.clicks) },
  { label: "CTR", help: `Clics / Impresiones. ${PAID}`, fn: (r) => fmtPct(ctr(r)) },
  { label: "CPC", help: `Spend / Clics. ${PAID}`, fn: (r) => fmtEur(cpc(r)) },
  { label: "CPM", help: `Spend / Impresiones × 1000. ${PAID}`, fn: (r) => fmtEur(cpm(r)) },
  { label: "Leads", help: CRM, fn: (r) => fmtNum(r.leads) },
  { label: "MQL", help: CRM, fn: (r) => fmtNum(r.mql) },
  { label: "SQL", help: CRM, fn: (r) => fmtNum(r.sql) },
  { label: "CPL", help: `Spend / Leads. ${MIX}`, fn: (r) => fmtEur(cpl(r)) },
  { label: "CPMQL", help: `Spend / MQL. ${MIX}`, fn: (r) => fmtEur(cpmql(r)) },
  { label: "CPSQL", help: `Spend / SQL. ${MIX}`, fn: (r) => fmtEur(cpsql(r)) },
  { label: "Pipeline €", help: `Importe de deals atribuidos. ${CRM}`, fn: (r) => fmtEur(r.pipeline) },
  { label: "Closed Won", help: `Deals ganados. ${CRM}`, fn: (r) => fmtEur(r.closedWon) },
  { label: "ROI", help: "(Pipeline € − Spend) / Spend.", fn: (r) => fmtPct(roi(r)) },
];

export function PaidClient({
  initial,
  groups,
  tags: initialTags,
}: {
  initial: CampaignRow[];
  groups: CountryGroups;
  tags: Record<string, string[]>;
}) {
  const [tags, setTags] = useState(initialTags);
  const [, startTransition] = useTransition();
  const [filters, setFilters] = useState(emptyFilters);
  const [search, setSearch] = useState("");

  const allRows = aggregateByCampaign(filterCampaigns(initial, filters, groups));
  const rows = search.trim()
    ? allRows.filter((r) => r.campaign.toLowerCase().includes(search.trim().toLowerCase()))
    : allRows;
  const t = sumMetrics(rows);

  const updateTags = (campaign: string, raw: string) => {
    const list = raw.split(",").map((tag) => tag.trim()).filter(Boolean);
    setTags((cur) => ({ ...cur, [campaign]: list }));
    startTransition(() => {
      void actionSetCampaignTags(campaign, list);
    });
  };

  return (
    <>
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        countries={paidCountriesOf(initial)}
        months={monthsOf(initial)}
        channels={[...new Set(initial.map((r) => r.channel))].sort()}
        groups={groups}
      />

      <div className="mb-4 flex items-center gap-3">
        <input
          className="control w-72"
          placeholder="Buscar campaña…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-xs text-[var(--muted)]">
          {rows.length} de {allRows.length} campañas
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-[var(--subtle)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-3">Canal</th>
              <th className="px-3 py-3">Campaña</th>
              <th className="px-3 py-3">País</th>
              {cols.map((c) => (
                <th key={c.label} className="px-3 py-3 text-right">
                  <span className="inline-flex flex-row-reverse items-center gap-1">
                    {c.label}
                    <Tooltip content={c.help} />
                  </span>
                </th>
              ))}
              <th className="px-3 py-3">Etiquetas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.campaign} className="border-t border-[var(--border)] hover:bg-[var(--subtle)]">
                <td className="px-3 py-3">{r.channel}</td>
                <td className="px-3 py-3 font-mono text-xs">{r.campaign}</td>
                <td className="px-3 py-3">{r.country}</td>
                {cols.map((c) => (
                  <td key={c.label} className="px-3 py-3 text-right tabular-nums">{c.fn(r)}</td>
                ))}
                <td className="px-3 py-2">
                  <input
                    defaultValue={(tags[r.campaign] ?? []).join(", ")}
                    onBlur={(e) => updateTags(r.campaign, e.target.value)}
                    placeholder="Webinar, MOFU…"
                    className="w-40 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={cols.length + 4} className="px-4 py-6 text-center text-[var(--muted)]">Sin datos para los filtros.</td></tr>
            )}
          </tbody>
          <tfoot className="border-t-2 border-[var(--border)] bg-[var(--subtle)] font-semibold">
            <tr>
              <td className="px-3 py-3" colSpan={3}>Total</td>
              {cols.map((c) => (
                <td key={c.label} className="px-3 py-3 text-right tabular-nums">{c.fn(t)}</td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 text-xs text-[var(--muted)]">
        Etiquetas separadas por comas (p.ej. <code>Webinar, MOFU</code>) para agrupar campañas y seguir resultados
        conjuntos. Se persisten en Supabase; en local quedan en memoria de la sesión.
      </p>
    </>
  );
}
