"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/Page";
import { GroupedBars } from "@/components/ui/charts";
import { fmtEur, fmtNum } from "@/lib/kpis";
import type { SdrCallsData, SdrCallsRow } from "@/lib/data/sdr-calls";
import type { PipelineTotalRow } from "@/lib/data/pipeline-totals";
import { SDR_PIPELINE_LABEL, type SdrPipeline } from "@/lib/data/sdr-pipelines";

// Rótulo de mes compacto: "2026-07" -> "jul 26".
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function monthLabel(m: string): string {
  const [y, mm] = m.split("-");
  return `${MESES[Number(mm) - 1] ?? mm} ${y.slice(2)}`;
}

// Regiones = los tres pipelines de new business (lib/pipelines.ts).
const REGIONS: { key: string; label: string; ids: string[] | null }[] = [
  { key: "all", label: "Todos", ids: null },
  { key: "spain", label: "Spain", ids: ["7888791"] },
  { key: "dach", label: "DACH", ids: ["883841939"] },
  { key: "intl", label: "Rest of Intl", ids: ["727373069"] },
];

const repKey = (r: SdrCallsRow) => r.ownerId ?? r.name;

// Distintivo de pipeline del SDR — colores propios por pipeline para leerlos de
// un vistazo tanto en las chips del selector como en la matriz.
const PIPELINE_STYLE: Record<SdrPipeline, string> = {
  AE: "bg-[var(--accent-soft)] text-[var(--accent)]",
  DACH: "bg-[var(--good-bg)] text-[var(--good-text)]",
};
function PipelineTag({ pipeline }: { pipeline: SdrPipeline | null }) {
  if (!pipeline) {
    return <span className="text-[10px] uppercase tracking-wide text-[var(--faint)]">Sin asignar</span>;
  }
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${PIPELINE_STYLE[pipeline]}`}>
      {SDR_PIPELINE_LABEL[pipeline]}
    </span>
  );
}

export function SdrsClient({
  sdr,
  pipelineTotals,
}: {
  sdr: SdrCallsData;
  pipelineTotals: PipelineTotalRow[];
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(sdr.reps.map(repKey)));
  const [region, setRegion] = useState<string>("all");
  const [showAll, setShowAll] = useState(false);

  const selectedReps = useMemo(
    () => sdr.reps.filter((r) => selected.has(repKey(r))),
    [sdr.reps, selected],
  );

  // Eje de meses estable: union de meses de llamadas y de pipe (independiente de
  // filtros de selección/región).
  const allPipeMonths = useMemo(() => pipelineTotals.map((r) => r.month), [pipelineTotals]);
  const months = useMemo(() => {
    const s = new Set<string>([...sdr.months, ...allPipeMonths]);
    return [...s].sort();
  }, [sdr.months, allPipeMonths]);

  // Llamadas/mes de los SDRs seleccionados.
  const callsByMonth = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const m of months) acc[m] = selectedReps.reduce((s, r) => s + (r.byMonth[m] ?? 0), 0);
    return acc;
  }, [months, selectedReps]);

  // Pipe/mes filtrado por región.
  const pipeByMonth = useMemo(() => {
    const ids = REGIONS.find((r) => r.key === region)?.ids ?? null;
    const acc: Record<string, number> = {};
    for (const r of pipelineTotals) {
      if (ids && !ids.includes(r.pipelineId)) continue;
      acc[r.month] = (acc[r.month] ?? 0) + r.amount;
    }
    return acc;
  }, [pipelineTotals, region]);

  const categories = months.map(monthLabel);
  const callValues = months.map((m) => callsByMonth[m] ?? 0);
  const pipeValues = months.map((m) => pipeByMonth[m] ?? 0);
  const dialerValues = months.map((m) => sdr.dialer.byMonth[m] ?? 0);
  // Nº de llamadas necesarias para generar 1.000 € de pipe (región), por mes:
  // llamadas seleccionadas ÷ (pipe / 1.000). Menos llamadas = más eficiente.
  const effValues = months.map((m) => {
    const pipe = pipeByMonth[m] ?? 0;
    return pipe > 0 ? (callsByMonth[m] ?? 0) / (pipe / 1000) : 0;
  });

  const shownReps = showAll ? selectedReps : selectedReps.slice(0, 15);
  const regionLabel = REGIONS.find((r) => r.key === region)?.label ?? "Todos";

  const toggle = (k: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  // Nº de SDRs por pipeline — para rotular los botones de selección rápida.
  const pipelineCounts = useMemo(() => {
    const c = { AE: 0, DACH: 0, none: 0 } as { AE: number; DACH: number; none: number };
    for (const r of sdr.reps) {
      if (r.pipeline === "AE") c.AE++;
      else if (r.pipeline === "DACH") c.DACH++;
      else c.none++;
    }
    return c;
  }, [sdr.reps]);

  // Selección rápida por pipeline: deja seleccionados solo los SDRs de ese
  // pipeline (o los que no tienen ninguno asignado). Reaprovecha el mecanismo
  // de selección existente: calls, matriz y eficiencia se recalculan solos.
  const selectByPipeline = (p: SdrPipeline | "none") =>
    setSelected(
      new Set(
        sdr.reps
          .filter((r) => (p === "none" ? r.pipeline === null : r.pipeline === p))
          .map(repKey),
      ),
    );

  return (
    <div className="space-y-6">
      {sdr.reps.length === 0 && (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--subtle)] px-3 py-2 text-xs text-[var(--muted)]">
          Aún no hay llamadas con owner ingeridas — se poblarán en el próximo sync de HubSpot
          (tras aplicar la migración 0026). El pipe por mes de abajo ya es real.
        </p>
      )}

      {/* Selector de SDRs — recalcula llamadas, matriz y eficiencia. */}
      <Panel title={`SDRs en el análisis (${selectedReps.length}/${sdr.reps.length})`}>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => setSelected(new Set(sdr.reps.map(repKey)))}
            className="rounded border border-[var(--border)] px-2 py-1 hover:bg-[var(--subtle)]"
          >
            Todos
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="rounded border border-[var(--border)] px-2 py-1 hover:bg-[var(--subtle)]"
          >
            Ninguno
          </button>
          <span className="mx-1 text-[var(--faint)]">·</span>
          <span className="text-[var(--muted)]">Por pipeline:</span>
          <button
            onClick={() => selectByPipeline("AE")}
            disabled={pipelineCounts.AE === 0}
            className="rounded border border-[var(--border)] px-2 py-1 hover:bg-[var(--subtle)] disabled:opacity-40"
          >
            {SDR_PIPELINE_LABEL.AE} <span className="tabular-nums text-[var(--faint)]">{pipelineCounts.AE}</span>
          </button>
          <button
            onClick={() => selectByPipeline("DACH")}
            disabled={pipelineCounts.DACH === 0}
            className="rounded border border-[var(--border)] px-2 py-1 hover:bg-[var(--subtle)] disabled:opacity-40"
          >
            {SDR_PIPELINE_LABEL.DACH} <span className="tabular-nums text-[var(--faint)]">{pipelineCounts.DACH}</span>
          </button>
          {pipelineCounts.none > 0 && (
            <button
              onClick={() => selectByPipeline("none")}
              className="rounded border border-[var(--border)] px-2 py-1 hover:bg-[var(--subtle)]"
            >
              Sin asignar <span className="tabular-nums text-[var(--faint)]">{pipelineCounts.none}</span>
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {sdr.reps.map((r) => {
            const on = selected.has(repKey(r));
            return (
              <button
                key={repKey(r)}
                onClick={() => toggle(repKey(r))}
                aria-pressed={on}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                  on
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--subtle)]"
                }`}
              >
                <span>{r.name}</span>
                <PipelineTag pipeline={r.pipeline} />
                {r.status === "Left" && <span className="text-[10px] text-[var(--faint)]">·baja</span>}
                <span className="tabular-nums text-[var(--faint)]">{fmtNum(r.total)}</span>
              </button>
            );
          })}
        </div>
      </Panel>

      {/* Llamadas/mes (seleccionados) + Pipe/mes (filtrable por región). */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Llamadas por mes (SDRs seleccionados)">
          <GroupedBars
            categories={categories}
            series={[{ label: "Llamadas", color: "var(--brand)", values: callValues }]}
            formatValue={(v) => fmtNum(v)}
          />
        </Panel>
        <Panel title={`Pipeline abierto por mes (€) · ${regionLabel}`}>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {REGIONS.map((r) => (
              <button
                key={r.key}
                onClick={() => setRegion(r.key)}
                aria-pressed={region === r.key}
                className={`rounded border px-2.5 py-1 text-xs transition-colors ${
                  region === r.key
                    ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "border-[var(--border)] text-[var(--muted)] hover:bg-[var(--subtle)]"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <GroupedBars
            categories={categories}
            series={[{ label: "Pipe €", color: "var(--accent)", values: pipeValues }]}
            formatValue={(v) => fmtEur(v)}
          />
        </Panel>
      </div>

      {/* Eficiencia por mes: nº de llamadas necesarias para 1.000 € de pipe. */}
      <Panel title={`Llamadas necesarias para generar 1.000 € de pipe, por mes · ${regionLabel}`}>
        <p className="mb-3 text-xs text-[var(--muted)]">
          Llamadas de los SDRs seleccionados ÷ (pipe abierto ({regionLabel}) / 1.000).{" "}
          <strong>Menos llamadas = más eficiente.</strong> Meses sin pipe de la región salen como "–".
        </p>
        <GroupedBars
          categories={categories}
          series={[{ label: "Llamadas / 1.000 € pipe", color: "var(--good-text)", values: effValues }]}
          formatValue={(v) => (v > 0 ? `${v.toFixed(1).replace(".", ",")} llamadas` : "–")}
        />
      </Panel>

      {/* Matriz llamadas por comercial × mes (solo seleccionados). */}
      <Panel title="Llamadas por comercial y mes">
        {selectedReps.length === 0 ? (
          <p className="rounded-lg border border-[var(--border)] bg-[var(--subtle)] px-3 py-2 text-xs text-[var(--muted)]">
            No hay ningún SDR seleccionado. Elige al menos uno arriba.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="sticky left-0 bg-[var(--panel)] px-3 py-2">Comercial</th>
                    <th className="px-2 py-2">Pipeline</th>
                    <th className="px-2 py-2">Estado</th>
                    {months.map((m) => (
                      <th key={m} className="px-2 py-2 text-right tabular-nums">{monthLabel(m)}</th>
                    ))}
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-2 py-2 text-right">Meses act.</th>
                    <th className="px-2 py-2 text-right">Media/mes</th>
                  </tr>
                </thead>
                <tbody>
                  {shownReps.map((r) => (
                    <RepRow key={repKey(r)} r={r} months={months} />
                  ))}
                  <tr className="border-t-2 border-[var(--border)] bg-[var(--subtle)] font-semibold">
                    <td className="sticky left-0 bg-[var(--subtle)] px-3 py-2">
                      Total ({selectedReps.length} sel.)
                    </td>
                    <td className="px-2 py-2" />
                    <td className="px-2 py-2" />
                    {months.map((m) => (
                      <td key={m} className="px-2 py-2 text-right tabular-nums">{fmtNum(callsByMonth[m] ?? 0)}</td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtNum(selectedReps.reduce((s, r) => s + r.total, 0))}
                    </td>
                    <td className="px-2 py-2" />
                    <td className="px-2 py-2" />
                  </tr>
                </tbody>
              </table>
            </div>
            {selectedReps.length > 15 && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="mt-3 text-xs font-medium text-[var(--accent)] hover:underline"
              >
                {showAll ? "Ver solo el top 15" : `Ver todos (${selectedReps.length})`}
              </button>
            )}
          </>
        )}
      </Panel>

      {/* Contexto: dialer sin owner, no atribuible. */}
      <Panel title="Contexto — llamadas del dialer (sin owner, no atribuibles)">
        <p className="mb-3 text-xs text-[var(--muted)]">
          Llamadas de una integración/marcador automático sin propietario (empezó a dispararse
          ~feb-2026). No se pueden atribuir a ningún comercial, por eso van aparte y no cuentan en
          los totales por persona.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted)]">
              <tr>
                {months.map((m) => (
                  <th key={m} className="px-2 py-2 text-right tabular-nums">{monthLabel(m)}</th>
                ))}
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-[var(--border)]">
                {dialerValues.map((v, i) => (
                  <td key={months[i]} className="px-2 py-2 text-right tabular-nums text-[var(--muted)]">
                    {fmtNum(v)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtNum(sdr.totalDialer)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function RepRow({ r, months }: { r: SdrCallsRow; months: string[] }) {
  return (
    <tr className="border-t border-[var(--border)] hover:bg-[var(--subtle)]">
      <td className="sticky left-0 bg-[var(--panel)] px-3 py-2 font-medium">{r.name}</td>
      <td className="px-2 py-2"><PipelineTag pipeline={r.pipeline} /></td>
      <td className="px-2 py-2">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
            r.status === "Left"
              ? "bg-[var(--subtle)] text-[var(--faint)]"
              : "bg-[var(--good-bg)] text-[var(--good-text)]"
          }`}
        >
          {r.status === "Left" ? "Baja" : "Activo"}
        </span>
      </td>
      {months.map((m) => {
        const v = r.byMonth[m] ?? 0;
        return (
          <td key={m} className={`px-2 py-2 text-right tabular-nums ${v === 0 ? "text-[var(--faint)]" : ""}`}>
            {v === 0 ? "–" : fmtNum(v)}
          </td>
        );
      })}
      <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtNum(r.total)}</td>
      <td className="px-2 py-2 text-right tabular-nums text-[var(--muted)]">{r.activeMonths}</td>
      <td className="px-2 py-2 text-right tabular-nums text-[var(--muted)]">{fmtNum(r.avgPerActiveMonth)}</td>
    </tr>
  );
}
