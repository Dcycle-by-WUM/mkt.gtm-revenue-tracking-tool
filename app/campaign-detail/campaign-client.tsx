"use client";

import { useState, useTransition } from "react";
import { Panel } from "@/components/Page";
import {
  emptyMetrics, mockSpendTimeline,
  type CampaignRow,
} from "@/lib/mock-data";
import { fmtEur, fmtNum, fmtPct, cpl, roi, type ChannelMetrics } from "@/lib/kpis";
import { actionSetCampaignTags } from "@/app/actions";

type Agg = ChannelMetrics & { campaign: string; channel: string; campaignGroup: string | null; country: string };

function aggregateByCampaign(rows: CampaignRow[]): Agg[] {
  const map = new Map<string, Agg>();
  for (const r of rows) {
    const cur = map.get(r.campaign) ?? { ...emptyMetrics(), campaign: r.campaign, channel: r.channel, campaignGroup: r.campaignGroup, country: r.country };
    cur.spend += r.spend; cur.impressions += r.impressions; cur.clicks += r.clicks;
    cur.leads += r.leads; cur.mql += r.mql; cur.sql += r.sql;
    cur.pipeline += r.pipeline; cur.closedWon += r.closedWon;
    map.set(r.campaign, cur);
  }
  return [...map.values()].sort((a, b) => b.spend - a.spend);
}

export function CampaignDetailClient({
  campaigns,
  tags: initialTags,
}: {
  campaigns: CampaignRow[];
  tags: Record<string, string[]>;
}) {
  const agg = aggregateByCampaign(campaigns);
  const [tags, setTags] = useState(initialTags);
  const [selected, setSelected] = useState(agg[0]?.campaign ?? "");
  const [, startTransition] = useTransition();
  const c = agg.find((x) => x.campaign === selected) ?? agg[0];

  const setCampaignTags = (campaign: string, raw: string) => {
    const list = raw.split(",").map((t) => t.trim()).filter(Boolean);
    setTags((cur) => ({ ...cur, [campaign]: list }));
    startTransition(() => { void actionSetCampaignTags(campaign, list); });
  };

  const allTags = [...new Set(Object.values(tags).flat())].sort();
  const byTag = allTags.map((tag) => {
    const members = agg.filter((x) => (tags[x.campaign] ?? []).includes(tag));
    const m = members.reduce((a, x) => {
      a.spend += x.spend; a.leads += x.leads; a.mql += x.mql; a.sql += x.sql; a.pipeline += x.pipeline;
      return a;
    }, emptyMetrics());
    return { tag, count: members.length, m };
  });

  const maxSpend = Math.max(...mockSpendTimeline.map((d) => d.spend));
  const funnel = c ? [
    { stage: "Leads", value: c.leads, money: false },
    { stage: "MQL", value: c.mql, money: false },
    { stage: "SQL", value: c.sql, money: false },
    { stage: "Pipeline €", value: c.pipeline, money: true },
    { stage: "Closed Won", value: c.closedWon, money: true },
  ] : [];

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm text-[var(--muted)]">Campaña:</span>
        <select
          className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          {agg.map((x) => <option key={x.campaign}>{x.campaign}</option>)}
        </select>
      </div>

      {c && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Spend timeline (semanal)">
            <div className="flex h-40 items-end gap-2">
              {mockSpendTimeline.map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <div className="w-full rounded-t bg-[var(--accent)]/70" style={{ height: `${(d.spend / maxSpend) * 100}%` }} title={fmtEur(d.spend)} />
                  <span className="text-[10px] text-[var(--muted)]">{d.date.slice(5)}</span>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Embudo">
            <div className="space-y-2">
              {funnel.map((f) => (
                <div key={f.stage} className="flex items-center gap-3">
                  <div className="w-24 text-sm text-[var(--muted)]">{f.stage}</div>
                  <div className="h-6 flex-1 rounded bg-white/5">
                    <div className="h-6 rounded bg-[var(--accent)]/60" style={{ width: `${Math.max((f.money ? f.value / Math.max(c.pipeline, 1) : f.value / Math.max(c.leads, 1)) * 100, 4)}%` }} />
                  </div>
                  <div className="w-24 text-right text-sm tabular-nums">{f.money ? fmtEur(f.value) : fmtNum(f.value)}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-6 border-t border-[var(--border)] pt-3 text-sm">
              <div><span className="text-[var(--muted)]">CPL: </span>{fmtEur(cpl(c))}</div>
              <div><span className="text-[var(--muted)]">ROI: </span>{fmtPct(roi(c))}</div>
            </div>
          </Panel>
        </div>
      )}

      <div className="mt-8">
        <Panel title="Etiquetas por campaña">
          <p className="mb-3 text-sm text-[var(--muted)]">
            Escribe etiquetas separadas por comas (p.ej. <code>Webinar, MOFU</code>). Agrupan campañas para seguir resultados conjuntos. Persisten en Supabase.
          </p>
          <div className="space-y-2">
            {agg.map((x) => (
              <div key={x.campaign} className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-2 last:border-0">
                <span className="font-mono text-xs">{x.campaign}</span>
                <input
                  defaultValue={(tags[x.campaign] ?? []).join(", ")}
                  onBlur={(e) => setCampaignTags(x.campaign, e.target.value)}
                  placeholder="etiquetas…"
                  className="w-56 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
                />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-6">
        <Panel title="Resultados por etiqueta">
          {byTag.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Aún no hay etiquetas. Añade alguna arriba.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="py-2">Etiqueta</th>
                    <th className="py-2 text-right">Campañas</th>
                    <th className="py-2 text-right">Spend</th>
                    <th className="py-2 text-right">Leads</th>
                    <th className="py-2 text-right">MQL</th>
                    <th className="py-2 text-right">SQL</th>
                    <th className="py-2 text-right">Pipeline €</th>
                    <th className="py-2 text-right">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {byTag.map(({ tag, count, m }) => (
                    <tr key={tag} className="border-t border-[var(--border)]">
                      <td className="py-2"><span className="rounded bg-[var(--accent)]/20 px-2 py-1 text-xs text-[var(--accent)]">{tag}</span></td>
                      <td className="py-2 text-right tabular-nums">{count}</td>
                      <td className="py-2 text-right tabular-nums">{fmtEur(m.spend)}</td>
                      <td className="py-2 text-right tabular-nums">{fmtNum(m.leads)}</td>
                      <td className="py-2 text-right tabular-nums">{fmtNum(m.mql)}</td>
                      <td className="py-2 text-right tabular-nums">{fmtNum(m.sql)}</td>
                      <td className="py-2 text-right tabular-nums">{fmtEur(m.pipeline)}</td>
                      <td className="py-2 text-right tabular-nums">{fmtPct(roi(m))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
