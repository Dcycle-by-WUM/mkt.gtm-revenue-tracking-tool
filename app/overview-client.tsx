"use client";

import { useMemo, useState, useTransition } from "react";
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
import { actionUpsertTarget } from "@/app/actions";

// Overview "Cómo vamos vs Target" — PRD §9 (2), rediseño jul-2026. Antes esta
// pantalla mostraba el funnel completo (ahora en /metrics); esta versión se
// centra en objetivo vs resultado por mes, 3 vistas (Spain / Rest of Intl +
// DACH / Total), inspirada en la hoja de forecast por canal del Excel.

// El objetivo (Obj) de Spain y de Rest of Intl + DACH se edita aquí mismo,
// por canal/mes, a nivel de bloque (igual que en la hoja Excel de origen:
// planifican por región, no país a país). La vieja pantalla Forecast &
// Objetivos (eliminada — esto ya vive en Overview) permitía fijar objetivos
// país a país (p. ej. UK, DE); esos targets "legacy" no se tocan ni se
// ocultan, siguen sumando aquí. El campo editable de esta pantalla es un
// "top-up" por región (país sintético, p. ej. "Rest of Intl + DACH"); al
// editarlo, guardamos solo la DIFERENCIA entre lo que se escribió y lo que
// ya aportan los targets legacy, así el número que ves = el número que
// editas, sin duplicar ni perder nada. Spain usa "ES" como su propio
// país-cubo (ya es 1:1 con la región hoy).
const REST_SCOPE_COUNTRY = "Rest of Intl + DACH";

type ScopeRow = {
  channel: Channel;
  targetSpend: number;
  targetPipeline: number;
  actualSpend: number;
  actualPipeline: number;
};

function legacyTargetSum(
  targets: ForecastRow[],
  month: string,
  channel: Channel,
  bucketCountry: string,
  inTargetScope: (country: string) => boolean,
  field: "targetSpend" | "targetPipeline",
): number {
  return targets
    .filter(
      (r) => r.month === month && r.channel === channel && r.country !== bucketCountry && inTargetScope(r.country),
    )
    .reduce((s, r) => s + r[field], 0);
}

function buildScopeRows(
  targets: ForecastRow[],
  campaigns: CampaignRow[],
  month: string,
  bucketCountry: string,
  inTargetScope: (country: string) => boolean,
  inActualScope: (country: string) => boolean,
): ScopeRow[] {
  const t = targets.filter((r) => r.month === month && (r.country === bucketCountry || inTargetScope(r.country)));
  const c = campaigns.filter((r) => r.month === month && inActualScope(r.country));
  return CHANNELS.map((channel) => ({
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

// Pipeline: más que el objetivo es bueno (verde a partir de 100%, ámbar
// cerca). Spend: más que el objetivo es sobrecoste (rojo a partir de 100%;
// verde por debajo, sin tramo ámbar intermedio).
function PacingBar({
  label,
  target,
  actual,
  mode,
}: {
  label: string;
  target: number;
  actual: number | null;
  mode: "pipeline" | "spend";
}) {
  if (target <= 0) return null;
  const pct = actual === null ? null : actual / target;
  const widthPct = pct === null ? 0 : Math.min(pct, 1) * 100;
  const barCls =
    pct === null
      ? "bg-[var(--border)]"
      : mode === "spend"
        ? pct > 1
          ? "bg-red-600"
          : "bg-emerald-600"
        : pct >= 1
          ? "bg-emerald-600"
          : pct >= 0.85
            ? "bg-amber-500"
            : "bg-red-600";
  return (
    <div className="flex items-center gap-2 px-4 py-2.5">
      <span className="w-16 shrink-0 text-[11px] uppercase tracking-wide text-[var(--muted)]">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--subtle)]">
        <div className={`h-full rounded-full ${barCls}`} style={{ width: `${widthPct}%` }} />
      </div>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums">{pct === null ? "—" : fmtPct(pct)}</span>
    </div>
  );
}

const objCell =
  "w-24 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-right text-sm tabular-nums";

function ScopeTable({
  title,
  rows,
  month,
  status,
  onEditObj,
  showSpendBar = false,
}: {
  title: string;
  rows: ScopeRow[];
  month: string;
  status: MonthStatus;
  /** Si se pasa, Spend Obj / Pipeline Obj se editan aquí mismo. Si no, son solo lectura (Total). */
  onEditObj?: (channel: Channel, field: "targetSpend" | "targetPipeline", value: number) => void;
  /** Total además muestra pacing de Spend (sobrecoste en rojo), no solo de Pipeline. */
  showSpendBar?: boolean;
}) {
  const total = sumScope(rows);
  const projTargetSpend = projected(total.actualSpend, month, status);
  const projTargetPipeline = projected(total.actualPipeline, month, status);

  return (
    <div className="card">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {showSpendBar && <PacingBar label="Spend" target={total.targetSpend} actual={projTargetSpend} mode="spend" />}
      <PacingBar label="Pipeline" target={total.targetPipeline} actual={projTargetPipeline} mode="pipeline" />
      <div className="overflow-x-auto rounded-b-xl">
        <table className="w-full text-sm">
          <thead className="bg-[var(--subtle)] text-left text-[11px] uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2">Canal</th>
              <th className="px-3 py-2 text-right">Spend Obj</th>
              <th className="px-3 py-2 text-right">Spend Actual</th>
              <th className="px-3 py-2 text-right">Δ</th>
              <th className="px-3 py-2 text-right">Pipeline Obj</th>
              <th className="px-3 py-2 text-right">Pipeline Actual</th>
              <th className="px-3 py-2 text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const spendActual = projected(r.actualSpend, month, status);
              const pipeActual = projected(r.actualPipeline, month, status);
              return (
                <tr key={r.channel} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">{r.channel}</td>
                  <td className="px-3 py-2 text-right">
                    {onEditObj ? (
                      <input
                        type="number"
                        className={objCell}
                        value={r.targetSpend}
                        onChange={(e) => onEditObj(r.channel, "targetSpend", +e.target.value)}
                      />
                    ) : (
                      <span className="tabular-nums">{fmtEur(r.targetSpend)}</span>
                    )}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      spendActual !== null && spendActual > r.targetSpend ? "text-red-700" : ""
                    }`}
                  >
                    {spendActual === null ? "—" : fmtEur(spendActual)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <DeltaBadge pct={r.targetSpend > 0 && spendActual !== null ? spendActual / r.targetSpend : null} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    {onEditObj ? (
                      <input
                        type="number"
                        className={objCell}
                        value={r.targetPipeline}
                        onChange={(e) => onEditObj(r.channel, "targetPipeline", +e.target.value)}
                      />
                    ) : (
                      <span className="tabular-nums">{fmtEur(r.targetPipeline)}</span>
                    )}
                  </td>
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
          <tfoot>
            <tr className="border-t-2 border-[var(--border)] font-semibold">
              <td className="px-3 py-2">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">{fmtEur(total.targetSpend)}</td>
              <td
                className={`px-3 py-2 text-right tabular-nums ${
                  projTargetSpend !== null && projTargetSpend > total.targetSpend ? "text-red-700" : ""
                }`}
              >
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
        </table>
      </div>
      {onEditObj && (
        <p className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--muted)]">
          Spend Obj / Pipeline Obj se editan aquí y se guardan al vuelo.
        </p>
      )}
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
  const [targetsState, setTargetsState] = useState(targets);
  const [, startTransition] = useTransition();

  const allMonths = useMemo(
    () => [...new Set([...campaigns.map((c) => c.month), ...targetsState.map((t) => t.month)])].sort(),
    [campaigns, targetsState],
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

  const spainInTargetScope = (country: string) => regionOf(country, groups) === "Spain";
  const restInTargetScope = (country: string) => country !== NO_COUNTRY && regionOf(country, groups) !== "Spain";

  const spainRows = useMemo(
    () => buildScopeRows(targetsState, campaigns, month, "ES", spainInTargetScope, spainInTargetScope),
    [targetsState, campaigns, month, groups],
  );
  const restRows = useMemo(
    () => buildScopeRows(targetsState, campaigns, month, REST_SCOPE_COUNTRY, restInTargetScope, restInTargetScope),
    [targetsState, campaigns, month, groups],
  );
  // Total nunca se edita: Obj = suma de Spain + Rest; Actual = suma real de
  // TODAS las campañas del mes (incluye "Sin país / Multi").
  const totalRows: ScopeRow[] = useMemo(() => {
    const monthCampaigns = campaigns.filter((c) => c.month === month);
    return CHANNELS.map((channel) => {
      const spainR = spainRows.find((r) => r.channel === channel)!;
      const restR = restRows.find((r) => r.channel === channel)!;
      const chCampaigns = monthCampaigns.filter((c) => c.channel === channel);
      return {
        channel,
        targetSpend: spainR.targetSpend + restR.targetSpend,
        targetPipeline: spainR.targetPipeline + restR.targetPipeline,
        actualSpend: chCampaigns.reduce((s, r) => s + r.spend, 0),
        actualPipeline: chCampaigns.reduce((s, r) => s + r.pipeline, 0),
      };
    });
  }, [campaigns, month, spainRows, restRows]);

  // El input muestra el total (targets legacy por país + top-up de este
  // bloque). Al editar, solo se recalcula y persiste el top-up — nunca
  // tocamos los targets legacy por país que ya existieran (p. ej. UK, DE).
  const editObjFor =
    (bucketCountry: string, inTargetScope: (country: string) => boolean) =>
    (channel: Channel, field: "targetSpend" | "targetPipeline", value: number) => {
      setTargetsState((cur) => {
        const legacy = legacyTargetSum(cur, month, channel, bucketCountry, inTargetScope, field);
        const topUp = value - legacy;
        const idx = cur.findIndex((r) => r.channel === channel && r.month === month && r.country === bucketCountry);
        let next: ForecastRow[];
        let row: ForecastRow;
        if (idx === -1) {
          row = { channel, month, country: bucketCountry, targetSpend: 0, targetPipeline: 0, [field]: topUp };
          next = [...cur, row];
        } else {
          row = { ...cur[idx], [field]: topUp };
          next = cur.map((r, i) => (i === idx ? row : r));
        }
        startTransition(() => { void actionUpsertTarget(row); });
        return next;
      });
    };

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
        <ScopeTable
          title="Spain"
          rows={spainRows}
          month={month}
          status={status}
          onEditObj={editObjFor("ES", spainInTargetScope)}
        />
        <ScopeTable
          title="Rest of Intl + DACH"
          rows={restRows}
          month={month}
          status={status}
          onEditObj={editObjFor(REST_SCOPE_COUNTRY, restInTargetScope)}
        />
        <ScopeTable title="Total" rows={totalRows} month={month} status={status} showSpendBar />
      </div>

      <p className="mt-4 text-xs text-[var(--muted)]">
        Total no se edita: Spend/Pipeline Obj son la suma de Spain + Rest of Intl + DACH, y Spend/Pipeline Actual son
        la suma real de todas las campañas del mes. En el mes en curso el Actual es una proyección a fin de mes a
        partir de lo consolidado a fecha (pacing lineal); en meses cerrados es el real consolidado.
      </p>
    </>
  );
}
