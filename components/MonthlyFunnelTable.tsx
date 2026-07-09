import type { ChannelMetrics } from "@/lib/kpis";
import { fmtEur, fmtNum, fmtPct, cpl, cpmql, cpsql, mqlRate, sqlRate, leadToSqlRate, avgPipePerSql } from "@/lib/kpis";
import { sumMetrics, type CampaignRow } from "@/lib/mock-data";

// Tabla de funnel mensual por canal — Overview "Cómo vamos". Réplica de la
// hoja FORECASTS (METRICAS - SPAIN/INT): filas = mes, columnas = todo el
// funnel + eficiencia. A diferencia de PivotTable (agrupación libre), esta
// tabla es de forma fija a propósito, para calcar la hoja 1:1.

const COLUMNS: { label: string; render: (m: ChannelMetrics) => string }[] = [
  { label: "Leads", render: (m) => fmtNum(m.leads) },
  { label: "MQL", render: (m) => fmtNum(m.mql) },
  { label: "SQL", render: (m) => fmtNum(m.sql) },
  { label: "Pipeline €", render: (m) => fmtEur(m.pipeline) },
  { label: "Spend", render: (m) => fmtEur(m.spend) },
  { label: "CPL", render: (m) => fmtEur(cpl(m)) },
  { label: "CPMQL", render: (m) => fmtEur(cpmql(m)) },
  { label: "CPSQL", render: (m) => fmtEur(cpsql(m)) },
  { label: "% Lead→MQL", render: (m) => fmtPct(mqlRate(m)) },
  { label: "% MQL→SQL", render: (m) => fmtPct(sqlRate(m)) },
  { label: "% Lead→SQL", render: (m) => fmtPct(leadToSqlRate(m)) },
  { label: "Avg Pipe/SQL", render: (m) => fmtEur(avgPipePerSql(m)) },
];

function monthlyGroups(rows: CampaignRow[]): [string, ChannelMetrics][] {
  const map = new Map<string, ChannelMetrics>();
  for (const r of rows) {
    const acc = map.get(r.month) ?? {
      spend: 0, impressions: 0, clicks: 0, leads: 0, mql: 0, sql: 0, pipeline: 0, closedWon: 0,
    };
    acc.spend += r.spend;
    acc.impressions += r.impressions;
    acc.clicks += r.clicks;
    acc.leads += r.leads;
    acc.mql += r.mql;
    acc.sql += r.sql;
    acc.pipeline += r.pipeline;
    acc.closedWon += r.closedWon;
    map.set(r.month, acc);
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function Table({
  rowLabelHeader,
  rows,
}: {
  rowLabelHeader: string;
  rows: { label: string; metrics: ChannelMetrics; emphasize?: boolean }[];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-[var(--subtle)] text-left text-xs uppercase text-[var(--muted)]">
          <tr>
            <th className="px-3 py-2">{rowLabelHeader}</th>
            {COLUMNS.map((c) => (
              <th key={c.label} className="px-3 py-2 text-right">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.label}
              className={`border-t border-[var(--border)] ${r.emphasize ? "bg-[var(--subtle)] font-semibold" : ""}`}
            >
              <td className="px-3 py-2 font-mono text-xs">{r.label}</td>
              {COLUMNS.map((c) => (
                <td key={c.label} className="px-3 py-2 text-right tabular-nums">{c.render(r.metrics)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MonthlyFunnelTable({ title, rows }: { title: string; rows: CampaignRow[] }) {
  if (rows.length === 0) return null;
  const months = monthlyGroups(rows);
  const total = sumMetrics(rows);

  return (
    <div className="mb-6">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <Table
        rowLabelHeader="Mes"
        rows={[
          ...months.map(([month, m]) => ({ label: month, metrics: m })),
          { label: "Total", metrics: total, emphasize: true },
        ]}
      />
    </div>
  );
}

export function ChannelTotalsTable({
  title,
  channelRows,
}: {
  title: string;
  channelRows: { label: string; metrics: ChannelMetrics }[];
}) {
  if (channelRows.length === 0) return null;
  const total = channelRows.reduce<ChannelMetrics>(
    (acc, c) => ({
      spend: acc.spend + c.metrics.spend,
      impressions: acc.impressions + c.metrics.impressions,
      clicks: acc.clicks + c.metrics.clicks,
      leads: acc.leads + c.metrics.leads,
      mql: acc.mql + c.metrics.mql,
      sql: acc.sql + c.metrics.sql,
      pipeline: acc.pipeline + c.metrics.pipeline,
      closedWon: acc.closedWon + c.metrics.closedWon,
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0, mql: 0, sql: 0, pipeline: 0, closedWon: 0 },
  );

  return (
    <div className="mb-6">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <Table
        rowLabelHeader="Canal"
        rows={[
          ...channelRows.map((c) => ({ label: c.label, metrics: c.metrics })),
          { label: "Total", metrics: total, emphasize: true },
        ]}
      />
    </div>
  );
}
