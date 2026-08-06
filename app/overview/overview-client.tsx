"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  CHANNELS,
  NO_COUNTRY,
  type CampaignRow,
  type Channel,
  type ForecastRow,
} from "@/lib/mock-data";
import { regionOf, type CountryGroups } from "@/lib/regions";
import { fmtEur, fmtPct } from "@/lib/kpis";
import { monthStatus, daysElapsedAndTotal, type MonthStatus } from "@/lib/pacing";
import { actionUpsertTarget } from "@/app/actions";
import { Tooltip } from "@/components/ui/Tooltip";
import { GroupedBars, Donut } from "@/components/ui/charts";
import { TOTAL_PIPELINES } from "@/lib/pipelines";
import type { PipelineTotalRow } from "@/lib/data/pipeline-totals";

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

// Antes de este mes no había objetivos fiables cargados — la gráfica de
// tendencia Objetivo vs Real solo tiene sentido a partir de aquí.
const CHART_START_MONTH = "2026-06";

// Cuántos meses por delante del actual se pueden planificar aunque todavía
// no tengan ninguna campaña ni target cargado — sin esto, el selector de
// mes (← / → / desplegable) solo enseña meses que YA tienen datos, y no hay
// forma de llegar a un mes futuro para dejarle el objetivo puesto.
const FUTURE_MONTHS_AHEAD = 12;

function addMonths(yyyyMM: string, n: number): string {
  const [y, m] = yyyyMM.split("-").map(Number);
  const total = (y * 12 + (m - 1)) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

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

// Real consolidado a fecha: mes cerrado o en curso muestran el valor real
// (sin proyectar); un mes futuro no tiene real todavía. Antes el mes en
// curso se proyectaba a fin de mes (pacing lineal); se quitó para mostrar
// siempre el dato real consolidado.
function consolidated(value: number, _month: string, status: MonthStatus): number | null {
  if (status === "future") return null;
  return value;
}

// Cabecera alineada a la derecha con tooltip de origen del dato.
function ThRight({ label, help }: { label: string; help: string }) {
  return (
    <th className="px-3 py-2 text-right">
      <span className="inline-flex flex-row-reverse items-center gap-1">
        {label}
        <Tooltip content={help} />
      </span>
    </th>
  );
}

function DeltaBadge({ pct, mode }: { pct: number | null; mode: "pipeline" | "spend" }) {
  if (pct === null) return <span className="text-xs text-[var(--muted)]">—</span>;
  const cls =
    mode === "spend"
      ? pct > 1.1
        ? "bg-[var(--error-bg)] text-[var(--error-text)]"
        : pct > 1
          ? "bg-[var(--warn-bg)] text-[var(--warn-text)]"
          : "bg-[var(--good-bg)] text-[var(--good-text)]"
      : pct >= 0.9
        ? "bg-[var(--good-bg)] text-[var(--good-text)]"
        : pct >= 0.7
          ? "bg-[var(--warn-bg)] text-[var(--warn-text)]"
          : "bg-[var(--error-bg)] text-[var(--error-text)]";
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{fmtPct(pct)}</span>;
}

// Stat de resumen: valor grande (real consolidado a fecha) + objetivo + chip de %.
function SummaryStat({
  label,
  actual,
  target,
  mode,
}: {
  label: string;
  actual: number | null;
  target: number;
  mode: "pipeline" | "spend";
}) {
  const pct = target > 0 && actual !== null ? actual / target : null;
  const tone =
    pct === null
      ? "muted"
      : mode === "spend"
        ? pct > 1.1 ? "error" : pct > 1 ? "warn" : "good"
        : pct >= 0.95 ? "good" : pct >= 0.7 ? "warn" : "error";
  const chip = {
    good: "bg-[var(--good-bg)] text-[var(--good-text)]",
    warn: "bg-[var(--warn-bg)] text-[var(--warn-text)]",
    error: "bg-[var(--error-bg)] text-[var(--error-text)]",
    muted: "text-[var(--muted)]",
  }[tone];
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</span>
        <span className={`rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${chip}`}>
          {pct === null ? "—" : fmtPct(pct)}
        </span>
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{actual === null ? "—" : fmtEur(actual)}</div>
      <div className="text-xs text-[var(--muted)]">{mode === "spend" ? "Budget" : "Objetivo"} {fmtEur(target)}</div>
    </div>
  );
}

// Pipeline TOTAL de new business (inbound + outbound/offline) por los tres
// pipelines AE/DACH/International, y qué % de ese total es inbound. El
// outbound NO tiene objetivo propio (por eso no lleva pacing ni Δ): es solo
// para el vistazo general. inbound ⊆ total por construcción (deal_attribution
// es un subconjunto de los deals crudos), así que el % nunca pasa de 100%.
function PipelineTotalShare({
  monthRows,
  inboundActual,
  month,
  status,
}: {
  /** Filas de `deal` crudo del mes seleccionado, una por pipeline. */
  monthRows: PipelineTotalRow[];
  /** Pipeline inbound real (a fecha) del mes — mismo dato que la stat Pipeline. */
  inboundActual: number;
  month: string;
  status: MonthStatus;
}) {
  const totalActual = monthRows.reduce((s, r) => s + r.amount, 0);
  // Real consolidado a fecha, misma convención que el resto de la pantalla
  // (mes en curso o cerrado → real; futuro → sin dato).
  const totalShown = consolidated(totalActual, month, status);
  // El % se calcula sobre el real a fecha. Clamp defensivo a [0, 1].
  const inboundPct = totalActual > 0 ? Math.min(1, inboundActual / totalActual) : null;
  const outboundActual = Math.max(0, totalActual - inboundActual);

  const basisLabel = status === "current" ? "real a fecha" : status === "past" ? "real" : "futuro";
  const inboundW = (inboundPct ?? 0) * 100;
  const outboundW = inboundPct === null ? 0 : (1 - inboundPct) * 100;

  const breakdown = (
    <div className="space-y-1.5">
      <div className="font-medium text-[var(--text)]">Pipeline total de new business</div>
      <div>
        No es un objetivo: es el REPARTO del pipeline total del mes (todos los
        deals de los 3 pipelines, vengan de inbound o de outbound/offline) entre
        lo que es inbound atribuido y lo que no. El outbound no tiene objetivo.
      </div>
      <div className="mt-1 border-t border-[var(--border)] pt-1.5">
        {TOTAL_PIPELINES.map((p) => {
          const amount = monthRows.find((r) => r.pipelineId === p.id)?.amount ?? 0;
          return (
            <div key={p.id} className="flex justify-between gap-4 tabular-nums">
              <span>
                {p.label}
                {!p.inScopeInbound && <span className="text-[var(--faint)]"> · outbound</span>}
              </span>
              <span>{fmtEur(amount)}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between gap-4 border-t border-[var(--border)] pt-1.5 tabular-nums">
        <span>Inbound (atribuido)</span>
        <span>{fmtEur(inboundActual)}</span>
      </div>
      <div className="flex justify-between gap-4 tabular-nums">
        <span>Outbound / offline</span>
        <span>{fmtEur(outboundActual)}</span>
      </div>
    </div>
  );

  return (
    <div className="mt-5 border-t border-[var(--border)] pt-4">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-[var(--muted)]">
          Pipeline total <span className="normal-case tracking-normal text-[var(--faint)]">· reparto</span>
          <Tooltip content={breakdown} />
        </span>
        <span className="text-sm font-semibold tabular-nums">{fmtEur(totalShown)}</span>
      </div>
      {/* Barra de COMPOSICIÓN (2 tramos: inbound + outbound), no de pacing —
          por eso no lleva objetivo ni color de semáforo. */}
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-[var(--subtle)]">
        <div className="h-full bg-[var(--chart-1)]" style={{ width: `${inboundW}%` }} />
        <div className="h-full bg-[var(--faint)]" style={{ width: `${outboundW}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[var(--chart-1)]" />
          Inbound <span className="font-medium tabular-nums text-[var(--text)]">{fmtEur(inboundActual)}</span>
          <span className="tabular-nums text-[var(--faint)]">· {fmtPct(inboundPct)}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm bg-[var(--faint)]" />
          Outbound/offline <span className="tabular-nums">{fmtEur(outboundActual)}</span>
          <span className="tabular-nums text-[var(--faint)]">· {fmtPct(inboundPct === null ? null : 1 - inboundPct)}</span>
        </span>
      </div>
      <p className="mt-1 text-[11px] text-[var(--faint)]">
        Cuánto del pipeline total del mes es inbound ({basisLabel}). El outbound no tiene objetivo.
      </p>
    </div>
  );
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
        ? pct > 1.1
          ? "bg-[var(--error-solid)]"
          : pct > 1
            ? "bg-[var(--warn-solid)]"
            : "bg-[var(--good-solid)]"
        : pct >= 0.95
          ? "bg-[var(--good-solid)]"
          : pct >= 0.7
            ? "bg-[var(--warn-solid)]"
            : "bg-[var(--error-solid)]";
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
  /** Si se pasa, Budget / Pipeline Obj se editan aquí mismo. Si no, son solo lectura (Total). */
  onEditObj?: (channel: Channel, field: "targetSpend" | "targetPipeline", value: number) => void;
  /** Total además muestra pacing de Spend (sobrecoste en rojo), no solo de Pipeline. */
  showSpendBar?: boolean;
}) {
  const total = sumScope(rows);
  const projTargetSpend = consolidated(total.actualSpend, month, status);
  const projTargetPipeline = consolidated(total.actualPipeline, month, status);

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
              <th className="px-3 py-2 text-right">Budget</th>
              <ThRight label="Spend Actual" help="Inversión real de paid media (LinkedIn+Google) vía Supermetrics. Real consolidado a fecha, sin proyectar." />
              <th className="px-3 py-2 text-right">Δ</th>
              <th className="px-3 py-2 text-right">Pipeline Obj</th>
              <ThRight label="Pipeline Actual" help="Pipeline € real de deals atribuidos (HubSpot), por utm_campaign. Real consolidado a fecha, sin proyectar." />
              <th className="px-3 py-2 text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const spendActual = consolidated(r.actualSpend, month, status);
              const pipeActual = consolidated(r.actualPipeline, month, status);
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
                      spendActual !== null && spendActual > r.targetSpend ? "text-[var(--error-text)]" : ""
                    }`}
                  >
                    {spendActual === null ? "—" : fmtEur(spendActual)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <DeltaBadge
                      pct={r.targetSpend > 0 && spendActual !== null ? spendActual / r.targetSpend : null}
                      mode="spend"
                    />
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
                    <DeltaBadge
                      pct={r.targetPipeline > 0 && pipeActual !== null ? pipeActual / r.targetPipeline : null}
                      mode="pipeline"
                    />
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
                  projTargetSpend !== null && projTargetSpend > total.targetSpend ? "text-[var(--error-text)]" : ""
                }`}
              >
                {projTargetSpend === null ? "—" : fmtEur(projTargetSpend)}
              </td>
              <td className="px-3 py-2 text-right">
                <DeltaBadge
                  pct={total.targetSpend > 0 && projTargetSpend !== null ? projTargetSpend / total.targetSpend : null}
                  mode="spend"
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
                  mode="pipeline"
                />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      {onEditObj && (
        <p className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--muted)]">
          Budget / Pipeline Obj se editan aquí y se guardan al vuelo.
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
      En curso · día {elapsed}/{total} ({fmtPct(elapsed / total)}) · real a fecha
    </span>
  );
}

export function OverviewClient({
  campaigns,
  targets,
  groups,
  pipelineTotals,
}: {
  campaigns: CampaignRow[];
  targets: ForecastRow[];
  groups: CountryGroups;
  pipelineTotals: PipelineTotalRow[];
}) {
  const [targetsState, setTargetsState] = useState(targets);
  const [, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  // Guardado con debounce: los inputs de Obj disparan onChange en cada
  // tecla; sin esto, cada pulsación lanzaba su propio actionUpsertTarget y,
  // al no garantizarse el orden de respuesta de la red, un request de un
  // valor parcial podía llegar después del final y "borrar" lo escrito.
  // Solo se persiste el último valor 500ms después de dejar de teclear.
  const saveTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = saveTimers.current;
    return () => timers.forEach((t) => clearTimeout(t));
  }, []);
  const scheduleSave = (row: ForecastRow) => {
    const key = `${row.channel}|${row.month}|${row.country}`;
    const existing = saveTimers.current.get(key);
    if (existing) clearTimeout(existing);
    saveTimers.current.set(
      key,
      setTimeout(() => {
        saveTimers.current.delete(key);
        startTransition(() => {
          void actionUpsertTarget(row).then((res) => {
            setSaveError(res.ok ? null : `No se pudo guardar ${row.channel} · ${row.month}: ${res.error}`);
          });
        });
      }, 500),
    );
  };

  const todayMonth = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  const allMonths = useMemo(() => {
    const fromData = [...campaigns.map((c) => c.month), ...targetsState.map((t) => t.month)];
    const planeable = Array.from({ length: FUTURE_MONTHS_AHEAD + 1 }, (_, i) => addMonths(todayMonth, i));
    return [...new Set([...fromData, ...planeable])].sort();
  }, [campaigns, targetsState, todayMonth]);

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

  // Serie mensual para la gráfica de tendencia Objetivo vs Real — desde
  // CHART_START_MONTH: antes de esa fecha no había objetivos fiables (los
  // meses previos mostraban Objetivo en 0 o discontinuo, sin aportar nada).
  const monthlyPipeline = useMemo(
    () =>
      allMonths
        .filter((m) => m >= CHART_START_MONTH)
        .map((m) => ({
          month: m,
          actual: campaigns.filter((c) => c.month === m).reduce((s, c) => s + c.pipeline, 0),
          target: targetsState.filter((r) => r.month === m).reduce((s, r) => s + r.targetPipeline, 0),
        })),
    [allMonths, campaigns, targetsState],
  );

  // Totales del mes seleccionado + reparto de pipeline por región (para la dona).
  const totalSel = useMemo(() => sumScope(totalRows), [totalRows]);
  const spainPipe = useMemo(() => spainRows.reduce((s, r) => s + r.actualPipeline, 0), [spainRows]);
  const restPipe = useMemo(() => restRows.reduce((s, r) => s + r.actualPipeline, 0), [restRows]);
  const otherPipe = Math.max(0, totalSel.actualPipeline - spainPipe - restPipe);

  // Pipeline total de new business del mes (deals crudos de los 3 pipelines),
  // para el bloque "Pipeline total" y el % de inbound sobre el total.
  const pipelineTotalMonthRows = useMemo(
    () => pipelineTotals.filter((r) => r.month === month),
    [pipelineTotals, month],
  );

  // Total por región (mapeo pipeline→región en lib/pipelines): Spain = AE;
  // Rest of Intl + DACH = International + DACH. Alimenta el reparto por
  // región, donde mostramos el inbound de cada región sobre su total.
  const totalByRegion = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of TOTAL_PIPELINES) {
      const amt = pipelineTotalMonthRows.find((r) => r.pipelineId === p.id)?.amount ?? 0;
      m.set(p.region, (m.get(p.region) ?? 0) + amt);
    }
    return m;
  }, [pipelineTotalMonthRows]);

  // Reparto por región: inbound (por país atribuido) y total (por pipeline de
  // HubSpot) de cada bucket. Se muestra si hay inbound O total.
  const regionRows = [
    { label: "Spain", color: "var(--chart-1)", inbound: spainPipe, total: totalByRegion.get("Spain") ?? 0 },
    { label: "Rest of Intl + DACH", color: "var(--chart-2)", inbound: restPipe, total: totalByRegion.get("Rest of Intl + DACH") ?? 0 },
    { label: "Sin país / Multi", color: "var(--chart-6)", inbound: otherPipe, total: 0 },
  ].filter((r) => r.inbound > 0 || r.total > 0);

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
        scheduleSave(row);
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

      {saveError && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-[var(--error-text)] bg-[var(--error-bg)] px-4 py-2.5 text-sm text-[var(--error-text)]">
          <span>{saveError}</span>
          <button onClick={() => setSaveError(null)} aria-label="Cerrar" className="shrink-0 opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Resumen al principio: totales del mes + reparto (izq) y tendencia (der). */}
      <div className="mb-6 grid items-stretch gap-4 lg:grid-cols-3">
        <div className="card flex flex-col p-5">
          <h3 className="mb-3 text-sm font-semibold">Resumen · {month}</h3>
          <div className="grid grid-cols-2 gap-4">
            <SummaryStat
              label="Pipeline"
              actual={consolidated(totalSel.actualPipeline, month, status)}
              target={totalSel.targetPipeline}
              mode="pipeline"
            />
            <SummaryStat
              label="Inversión"
              actual={consolidated(totalSel.actualSpend, month, status)}
              target={totalSel.targetSpend}
              mode="spend"
            />
          </div>
          <PipelineTotalShare
            monthRows={pipelineTotalMonthRows}
            inboundActual={totalSel.actualPipeline}
            month={month}
            status={status}
          />
          {regionRows.length > 0 && (
            <div className="mt-5 flex-1 border-t border-[var(--border)] pt-4">
              <div className="mb-3 text-xs uppercase tracking-wide text-[var(--muted)]">
                Reparto por región · inbound sobre total
              </div>
              <div className="flex flex-wrap items-center gap-5">
                <Donut
                  data={regionRows.map((r) => ({ label: r.label, value: r.inbound, color: r.color }))}
                  size={132}
                  formatValue={(v) => fmtEur(v)}
                  centerLabel="Inbound"
                  showLegend={false}
                />
                <ul className="space-y-2 text-sm">
                  {regionRows.map((r) => {
                    const pct = r.total > 0 ? Math.min(1, r.inbound / r.total) : null;
                    return (
                      <li key={r.label}>
                        <div className="flex items-center gap-2">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: r.color }} />
                          <span className="text-[var(--text-secondary)]">{r.label}</span>
                        </div>
                        <div className="pl-[18px] text-xs text-[var(--muted)]">
                          <span className="font-medium tabular-nums text-[var(--text)]">{fmtEur(r.inbound)}</span>{" "}
                          inbound
                          {r.total > 0 && (
                            <>
                              {" · de "}
                              <span className="tabular-nums">{fmtEur(r.total)}</span> total
                              <span className="text-[var(--faint)]"> ({fmtPct(pct)})</span>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div className="card flex flex-col p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold">Pipeline por mes · Objetivo vs Real</h3>
          <div className="flex flex-1 items-center">
            <GroupedBars
              categories={monthlyPipeline.map((m) => m.month)}
              series={[
                { label: "Objetivo", color: "var(--chart-3)", values: monthlyPipeline.map((m) => m.target) },
                { label: "Real", color: "var(--chart-1)", values: monthlyPipeline.map((m) => m.actual) },
              ]}
              formatValue={(v) => fmtEur(v)}
              height={260}
            />
          </div>
        </div>
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
        Total no se edita: Budget/Pipeline Obj son la suma de Spain + Rest of Intl + DACH, y Spend/Pipeline Actual son
        la suma real de todas las campañas del mes. El Actual es siempre el real consolidado a fecha (sin proyectar),
        tanto en el mes en curso como en meses cerrados.
      </p>
    </>
  );
}
