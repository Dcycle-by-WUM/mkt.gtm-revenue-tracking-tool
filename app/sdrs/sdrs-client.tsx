"use client";

import { useMemo, useState } from "react";
import { Panel } from "@/components/Page";
import { Stat } from "@/components/ui/Stat";
import { GroupedBars } from "@/components/ui/charts";
import { fmtEur, fmtNum } from "@/lib/kpis";
import type { SdrCallsData, SdrCallsRow } from "@/lib/data/sdr-calls";
import type { PipelineTotalRow } from "@/lib/data/pipeline-totals";

// Rótulo de mes compacto: "2026-07" -> "jul 26".
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function monthLabel(m: string): string {
  const [y, mm] = m.split("-");
  const idx = Number(mm) - 1;
  return `${MESES[idx] ?? mm} ${y.slice(2)}`;
}

const TOP_DEFAULT = 15;

export function SdrsClient({
  sdr,
  pipelineTotals,
}: {
  sdr: SdrCallsData;
  pipelineTotals: PipelineTotalRow[];
}) {
  const [showAll, setShowAll] = useState(false);

  // Pipe abierto (€) por mes = suma de los tres pipelines de new business.
  const pipeByMonth = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of pipelineTotals) acc[r.month] = (acc[r.month] ?? 0) + r.amount;
    return acc;
  }, [pipelineTotals]);

  // Eje de meses común: union de meses de llamadas y de pipe, orden ascendente.
  const months = useMemo(() => {
    const s = new Set<string>([...sdr.months, ...Object.keys(pipeByMonth)]);
    return [...s].sort();
  }, [sdr.months, pipeByMonth]);

  const categories = months.map(monthLabel);
  const callValues = months.map((m) => sdr.callsByMonth[m] ?? 0);
  const pipeValues = months.map((m) => pipeByMonth[m] ?? 0);
  const dialerValues = months.map((m) => sdr.dialer.byMonth[m] ?? 0);

  const totalPipe = pipeValues.reduce((s, v) => s + v, 0);
  const shownReps = showAll ? sdr.reps : sdr.reps.slice(0, TOP_DEFAULT);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Llamadas (con owner)"
          value={fmtNum(sdr.totalOwnerAssigned)}
          hint={`${sdr.reps.length} comerciales · ${months.length} meses`}
        />
        <Stat label="Pipe abierto" value={fmtEur(totalPipe)} hint="Suma AE + DACH + International" tone="brand" />
        <Stat
          label="Llamadas dialer (sin owner)"
          value={fmtNum(sdr.totalDialer)}
          hint="Integración ~feb-2026 · no atribuible"
          tone="warn"
        />
        <Stat
          label="Pipe / 1.000 llamadas"
          value={sdr.totalOwnerAssigned ? fmtEur((totalPipe / sdr.totalOwnerAssigned) * 1000) : "—"}
          hint="Eficiencia global (no por comercial)"
        />
      </div>

      {/* Dos series en paralelo: llamadas/mes y pipe/mes (escalas distintas). */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Llamadas por mes (con owner)">
          <GroupedBars
            categories={categories}
            series={[{ label: "Llamadas", color: "var(--brand)", values: callValues }]}
            formatValue={(v) => fmtNum(v)}
          />
        </Panel>
        <Panel title="Pipe abierto por mes (€)">
          <GroupedBars
            categories={categories}
            series={[{ label: "Pipe €", color: "var(--accent)", values: pipeValues }]}
            formatValue={(v) => fmtEur(v)}
          />
        </Panel>
      </div>

      {/* Matriz llamadas por comercial × mes. */}
      <Panel title="Llamadas por comercial y mes">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="sticky left-0 bg-[var(--panel)] px-3 py-2">Comercial</th>
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
                <RepRow key={r.ownerId ?? r.name} r={r} months={months} />
              ))}
              {/* Total con owner */}
              <tr className="border-t-2 border-[var(--border)] bg-[var(--subtle)] font-semibold">
                <td className="sticky left-0 bg-[var(--subtle)] px-3 py-2">Total (con owner)</td>
                <td className="px-2 py-2" />
                {months.map((m) => (
                  <td key={m} className="px-2 py-2 text-right tabular-nums">{fmtNum(sdr.callsByMonth[m] ?? 0)}</td>
                ))}
                <td className="px-3 py-2 text-right tabular-nums">{fmtNum(sdr.totalOwnerAssigned)}</td>
                <td className="px-2 py-2" />
                <td className="px-2 py-2" />
              </tr>
            </tbody>
          </table>
        </div>
        {sdr.reps.length > TOP_DEFAULT && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="mt-3 text-xs font-medium text-[var(--accent)] hover:underline"
          >
            {showAll ? "Ver solo el top 15" : `Ver todos (${sdr.reps.length})`}
          </button>
        )}
      </Panel>

      {/* Contexto: dialer sin owner, separado y no atribuible. */}
      <Panel title="Contexto — llamadas del dialer (sin owner, no atribuibles)">
        <p className="mb-3 text-xs text-[var(--muted)]">
          Llamadas de una integración/marcador automático sin propietario (empezó a dispararse
          ~feb-2026). No se pueden atribuir a ningún comercial, por eso van aparte y no cuentan en
          el total por persona.
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
          <td
            key={m}
            className={`px-2 py-2 text-right tabular-nums ${v === 0 ? "text-[var(--faint)]" : ""}`}
          >
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
