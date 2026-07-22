"use client";

import { useMemo, useState } from "react";
import {
  CHANNELS,
  NO_COUNTRY,
  type CampaignRow,
  type Channel,
  type ForecastRow,
} from "@/lib/mock-data";
import { regionOf, type CountryGroups } from "@/lib/regions";
import { fmtEur, fmtPct } from "@/lib/kpis";
import { monthStatus, daysElapsedAndTotal, projectFullMonth, type MonthStatus } from "@/lib/pacing";

// Overview "Cómo vamos vs Target" — PRD §9 (2), rediseño jul-2026. Antes esta
// pantalla mostraba el funnel completo (ahora en /metrics); esta versión se
// centra en objetivo vs resultado por mes, 3 vistas (Spain / Rest of Intl +
// DACH / Total), inspirada en la hoja de forecast por canal del Excel.

type ScopeRow = {
  channel: Channel;
  targetSpend: number;
  targetPipeline: number;
  actualSpend: number;
  actualPipeline: number;
};

function buildScopeRows(
  targets: ForecastRow[],
  campaigns: CampaignRow[],
  month: string,
  inScope: (country: string) => boolean,
): ScopeRow[] {
  const t = targets.filter((r) => r.month === month && inScope(r.country));
  const c = campaigns.filter((r) => r.month === month && inScope(r.country));
  const channels = CHANNELS.filter(
    (ch) => t.some((r) => r.channel === ch) || c.some((r) => r.channel === ch),
  );
  return channels.map((channel) => ({
    channel,
    targetSpend: t.filter((r) => r.channel === channel).reduce((s, r) => s + r.targetSpend, 0),
    targetPipeline: t.filter((r) => r.channel === channel).reduce((s, r) => s + r.targetPipeline, 0),
    actualSpend: c.filter((r) => r.channel === channel).reduce((s, r) => s + r.spend, 0),
    actualPipeline: c.filter((r) => r.channel === channel).reduce((s, r) => s + r.pipeline, 0),
  }));
}

function sumScope(rows: ScopeRow[]) {
  return rows.reduce(
    (a, r) => ({
      targetSpend: a.targetSpend + r.targetSpend,
      targetPipeline: a.targetPipeline + r.targetPipeline,
      actualSpend: a.actualSpend + r.actualSpend,
      actualPipeline: a.actualPipeline + r.actualPipeline,
    }),
    { targetSpend: 0, targetPipeline: 0, actualSpend: 0, actualPipeline: 0 },
  );
}

// Real consolidado si el mes ya cerró; proyección (pacing lineal sobre lo
// consolidado a fecha) si está en curso; sin dato si es un mes futuro.
function projected(value: number, month: string, status: MonthStatus): number | null {
  if (status === "future") return null;
  if (status === "past") return value;
  return projectFullMonth(value, month);
}

function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-xs text-[var(--muted)]">—</span>;
  const cls =
    pct >= 1
      ? "bg-[var(--good-bg)] text-[var(--good-text)]"
      : pct >= 0.85
        ? "bg-[var(--warn-bg)] text-[var(--warn-text)]"
        : "bg-red-50 text-red-700";
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{fmtPct(pct)}</span>;
}

function PacingBar({ target, actual }: { target: number; actual: number | null }) {
  if (target <= 0) return null;
  const pct = actual === null ? null : actual / target;
  const widthPct = pct === null ? 0 : Math.min(pct, 1) * 100;
  const barCls =
    pct === null
      ? "bg-[var(--border)]"
      : pct >= 1
        ? "bg-emerald-600"
        : pct >= 0.85
          ? "bg-amber-500"
          : "bg-red-600";
  return (
    <div className="flex items-center gap-2 px-4 py-2.5">
      <span className="w-16 shrink-0 text-[11px] uppercase tracking-wide text-[var(--muted)]">Pipeline</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--subtle)]">
        <div className={`h-full rounded-full ${barCls}`} style={{ width: `${widthPct}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums">{pct === null ? "—" : fmtPct(pct)}</span>
    </div>
  );
}

function ScopeTable({
  title,
  rows,
  month,
  status,
}: {
  title: string;
  rows: ScopeRow[];
  month: string;
  status: MonthStatus;
}) {
  const total = sumScope(rows);
  const actualLabel = status === "past" ? "Real" : status === "current" ? "Proyec." : "—";
  const projTargetSpend = projected(total.actualSpend, month, status);
  const projTargetPipeline = projected(total.actualPipeline, month, status);

  return (
    <div className="card">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <PacingBar target={total.targetPipeline} actual={projTargetPipeline} />
      <div className="overflow-x-auto rounded-b-xl">
        <table className="w-full text-sm">
          <thead className="bg-[var(--subtle)] text-left text-[11px] uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Canal</th>
              <th className="px-3 py-2 text-right">Spend obj.</th>
              <th className="px-3 py-2 text-right">Spend {actualLabel}</th>
              <th className="px-3 py-2 text-right">Δ</th>
              <th className="px-3 py-2 text-right">Pipeline obj.</th>
              <th className="px-3 py-2 text-right">Pipeline {actualLabel}</th>
              <th className="px-3 py-2 text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-xs text-[var(--muted)]">
                  Sin objetivos ni datos para este mes.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const spendActual = projected(r.actualSpend, month, status);
              const pipeActual = projected(r.actualPipeline, month, status);
              return (
                <tr key={r.channel} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">{r.channel}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtEur(r.targetSpend)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {spendActual === null ? "—" : fmtEur(spendActual)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <DeltaBadge pct={r.targetSpend > 0 && spendActual !== null ? spendActual / r.targetSpend : null} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtEur(r.targetPipeline)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {pipeActual === null ? "—" : fmtEur(pipeActual)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <DeltaBadge pct={r.targetPipeline > 0 && pipeActual !== null ? pipeActual / r.targetPipeline : null} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[var(--border)] font-semibold">
                <td className="px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtEur(total.targetSpend)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {projTargetSpend === null ? "—" : fmtEur(projTargetSpend)}
                </td>
                <td className="px-3 py-2 text-right">
                  <DeltaBadge
                    pct={total.targetSpend > 0 && projTargetSpend !== null ? projTargetSpend / total.targetSpend : null}
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtEur(total.targetPipeline)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {projTargetPipeline === null ? "—" : fmtEur(projTargetPipeline)}
                </td>
                <td className="px-3 py-2 text-right">
                  <DeltaBadge
                    pct={
                      total.targetPipeline > 0 && projTargetPipeline !== null
                        ? projTargetPipeline / total.targetPipeline
                        : null
                    }
                  />
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ month, status }: { month: string; status: MonthStatus }) {
  if (status === "past") {
    return (
      <span className="rounded-full bg-[var(--good-bg)] px-3 py-1 text-xs font-medium text-[var(--good-text)]">
        Cerrado · real consolidado
      </span>
    );
  }
  if (status === "future") {
    return (
      <span className="rounded-full bg-[var(--subtle)] px-3 py-1 text-xs font-medium text-[var(--muted)]">
        Futuro · solo objetivo
      </span>
    );
  }
  const { elapsed, total } = daysElapsedAndTotal(month);
  return (
    <span className="rounded-full bg-[var(--info-bg)] px-3 py-1 text-xs font-medium text-[var(--info-text)]">
      En curso · día {elapsed}/{total} ({fmtPct(elapsed / total)}) · proyectado a fin de mes
    </span>
  );
}

export function OverviewClient({
  campaigns,
  targets,
  groups,
}: {
  campaigns: CampaignRow[];
  targets: ForecastRow[];
  groups: CountryGroups;
}) {
  const allMonths = useMemo(
    () => [...new Set([...campaigns.map((c) => c.month), ...targets.map((t) => t.month)])].sort(),
    [campaigns, targets],
  );

  const todayMonth = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const [month, setMonth] = useState<string>(() => {
    if (allMonths.includes(todayMonth)) return todayMonth;
    const past = allMonths.filter((m) => m <= todayMonth);
    return past.length > 0 ? past[past.length - 1] : allMonths[allMonths.length - 1] ?? todayMonth;
  });

  const status = monthStatus(month);
  const idx = allMonths.indexOf(month);

  const spainRows = useMemo(
    () => buildScopeRows(targets, campaigns, month, (country) => regionOf(country, groups) === "Spain"),
    [targets, campaigns, month, groups],
  );
  const restRows = useMemo(
    () =>
      buildScopeRows(
        targets,
        campaigns,
        month,
        (country) => country !== NO_COUNTRY && regionOf(country, groups) !== "Spain",
      ),
    [targets, campaigns, month, groups],
  );
  const totalRows = useMemo(
    () => buildScopeRows(targets, campaigns, month, () => true),
    [targets, campaigns, month],
  );

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={() => idx > 0 && setMonth(allMonths[idx - 1])}
          disabled={idx <= 0}
          className="control px-2.5 py-1.5 disabled:opacity-30"
          aria-label="Mes anterior"
        >
          ←
        </button>
        <select className="control" value={month} onChange={(e) => setMonth(e.target.value)}>
          {allMonths.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <button
          onClick={() => idx < allMonths.length - 1 && setMonth(allMonths[idx + 1])}
          disabled={idx >= allMonths.length - 1}
          className="control px-2.5 py-1.5 disabled:opacity-30"
          aria-label="Mes siguiente"
        >
          →
        </button>
        <StatusBadge month={month} status={status} />
      </div>

      <div className="flex flex-col gap-4">
        <ScopeTable title="Spain" rows={spainRows} month={month} status={status} />
        <ScopeTable title="Rest of Intl + DACH" rows={restRows} month={month} status={status} />
        <ScopeTable title="Total" rows={totalRows} month={month} status={status} />
      </div>

      <p className="mt-4 text-xs text-[var(--muted)]">
        Objetivos editables en{" "}
        <a href="/forecast" className="underline">Forecast &amp; Objetivos</a>. Spend y Pipeline reales se calculan de
        los datos con atribución (Ads/HubSpot); en el mes en curso se muestra una proyección a fin de mes a partir
        de lo consolidado a fecha (pacing lineal).
      </p>
    </>
  );
}
