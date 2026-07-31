"use client";

import { useState } from "react";
import { Panel } from "@/components/Page";
import { FilterBar } from "@/components/FilterBar";
import {
  emptyFilters, currentYearStart, inMonthRange, type Filters,
} from "@/lib/mock-data";
import { fmtEur, fmtNum, fmtPct } from "@/lib/kpis";
import {
  AI_ENGINES, type DomainAuthoritySnapshot, type KeywordRanking, type OrganicLeadRow,
} from "@/lib/data/organic";
import type { DbOrganicTraffic, DbAiVisibility } from "@/lib/supabase/types";

// Orgánico (SEO) + AEO — PRD §11. Copilot como motor prioritario: la mayoría
// de clientes Dcycle lo usan y Copilot se nutre del índice de Bing (de ahí
// que el bloque Bing WMT sea salud técnica, no solo "otro canal").

const monthOf = (iso: string) => iso.slice(0, 7);

function distinctMonths(dates: string[]): string[] {
  return [...new Set(dates.map(monthOf))].sort();
}

// Mes de referencia = último mes dentro del rango filtrado; mes anterior =
// el que le precede cronológicamente en TODO el dataset (no solo el rango),
// para poder comparar aunque el filtro empiece justo en el mes de referencia.
function refAndPrevMonth(allMonths: string[], f: Filters): { ref: string | null; prev: string | null } {
  const inRange = allMonths.filter((m) => inMonthRange(m, f));
  const ref = inRange[inRange.length - 1] ?? null;
  if (!ref) return { ref: null, prev: null };
  const idx = allMonths.indexOf(ref);
  return { ref, prev: idx > 0 ? allMonths[idx - 1] : null };
}

function Delta({ value, invert = false, suffix = "" }: { value: number | null; invert?: boolean; suffix?: string }) {
  if (value === null || Number.isNaN(value)) return <span className="text-[var(--muted)]">—</span>;
  const good = invert ? value < 0 : value > 0;
  const cls = value === 0 ? "text-[var(--muted)]" : good ? "text-emerald-700" : "text-red-700";
  const arrow = value === 0 ? "→" : value > 0 ? "▲" : "▼";
  return <span className={cls}>{arrow} {Math.abs(value).toFixed(1)}{suffix}</span>;
}

function engineBreakdown(rows: DbAiVisibility[]) {
  return AI_ENGINES.map((engine) => {
    const rs = rows.filter((r) => r.platform === engine);
    if (rs.length === 0) return { engine, visibility: null as number | null, sov: null as number | null, total: 0 };
    const appeared = rs.filter((r) => r.appeared).length;
    const competitorMentions = rs.reduce((s, r) => s + r.competitors.filter((c) => c.appeared).length, 0);
    const sovTotal = appeared + competitorMentions;
    return { engine, visibility: appeared / rs.length, sov: sovTotal ? appeared / sovTotal : null, total: rs.length };
  });
}

export function OrganicClient({
  traffic, aiVisibility, domainAuthority, keywordRankings, leads,
}: {
  traffic: DbOrganicTraffic[];
  aiVisibility: DbAiVisibility[];
  domainAuthority: DomainAuthoritySnapshot;
  keywordRankings: KeywordRanking[];
  leads: OrganicLeadRow[];
}) {
  const [filters, setFilters] = useState<Filters>(() => ({ ...emptyFilters, monthFrom: currentYearStart() }));

  const countries = [...new Set(traffic.filter((t) => t.country).map((t) => t.country as string))].sort();
  const months = distinctMonths(traffic.map((t) => t.date));
  const { ref: refMonth, prev: prevMonth } = refAndPrevMonth(months, filters);

  const inRangeTraffic = traffic.filter(
    (t) => inMonthRange(monthOf(t.date), filters) && (!filters.country || t.country === filters.country),
  );
  const seoTraffic = inRangeTraffic.filter((t) => t.source !== "Bing");
  const inRangeLeads = leads.filter((l) => inMonthRange(l.month, filters));

  const nonBrandedClicks = seoTraffic.filter((t) => !t.is_branded).reduce((s, t) => s + t.clicks, 0);
  const top3AtRef = refMonth
    ? new Set(keywordRankings.filter((k) => monthOf(k.date) === refMonth && k.position <= 3).map((k) => k.keyword)).size
    : 0;
  const pipelineTotal = inRangeLeads.reduce((s, l) => s + l.dealAmount, 0);

  const kpiCards = [
    { label: "Tráfico orgánico non-branded (clics)", value: fmtNum(nonBrandedClicks) },
    { label: "Domain Authority (DA)", value: `${domainAuthority.da} (${domainAuthority.provider})` },
    { label: "Keywords estratégicas en Top 3", value: fmtNum(top3AtRef) },
    { label: "Leads orgánicos + IA", value: fmtNum(inRangeLeads.length) },
    { label: "Pipeline SEO + AEO €", value: fmtEur(pipelineTotal) },
  ];

  // Snapshot al mes de referencia: posición media no tiene sentido sumarla.
  const pageFilter = (t: DbOrganicTraffic, month: string) =>
    t.source !== "Bing" && t.page && monthOf(t.date) === month && (!filters.country || t.country === filters.country);
  const pagesAtRef = refMonth ? traffic.filter((t) => pageFilter(t, refMonth)) : [];
  const pagesAtPrev = prevMonth ? traffic.filter((t) => pageFilter(t, prevMonth)) : [];
  const sortedPages = [...pagesAtRef].sort((a, b) => (a.position_avg ?? 999) - (b.position_avg ?? 999));

  // Leads por fuente (Orgánico vs IA/LLMs) dentro del rango filtrado.
  const bySource = (["ORGANIC_SEARCH", "AI_REFERRALS"] as const).map((source) => {
    const rows = inRangeLeads.filter((l) => l.source === source);
    return { source, leads: rows.length, mql: rows.filter((l) => l.isMql).length, pipeline: rows.reduce((s, l) => s + l.dealAmount, 0) };
  });

  // AEO por motor — Copilot primero (AI_ENGINES ya viene en ese orden).
  const promptsAtRef = refMonth ? aiVisibility.filter((a) => monthOf(a.date) === refMonth) : [];
  const promptsAtPrev = prevMonth ? aiVisibility.filter((a) => monthOf(a.date) === prevMonth) : [];
  const engineAtRef = engineBreakdown(promptsAtRef);
  const engineAtPrev = engineBreakdown(promptsAtPrev);
  const citationGaps = promptsAtRef.filter((p) => !p.appeared);

  // Bing WMT — salud técnica de indexación (proxy de visibilidad en Copilot).
  // Snapshot al mes de referencia (no la suma del rango completo), para que
  // sea comparable 1:1 con el mes anterior.
  const bingSum = (rows: DbOrganicTraffic[]) => ({
    impressions: rows.reduce((s, r) => s + r.impressions, 0),
    clicks: rows.reduce((s, r) => s + r.clicks, 0),
    position: rows.length ? rows.reduce((s, r) => s + (r.position_avg ?? 0), 0) / rows.length : null,
  });
  const bingFilter = (t: DbOrganicTraffic, month: string) =>
    t.source === "Bing" && monthOf(t.date) === month && (!filters.country || t.country === filters.country);
  const bingNow = bingSum(refMonth ? traffic.filter((t) => bingFilter(t, refMonth)) : []);
  const bingPrev = bingSum(prevMonth ? traffic.filter((t) => bingFilter(t, prevMonth)) : []);

  return (
    <>
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        countries={countries}
        months={months}
        showChannel={false}
      />

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {kpiCards.map((c) => (
          <div key={c.label} className="card p-4">
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">{c.label}</div>
            <div className="mt-1.5 text-xl font-semibold tabular-nums">{c.value}</div>
          </div>
        ))}
      </div>

      {/* URLs mejor posicionadas */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        URLs mejor posicionadas {refMonth ? `— ${refMonth}` : ""}
      </h2>
      <div className="mb-3 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-[var(--subtle)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">URL</th>
              <th className="px-4 py-3">País</th>
              <th className="px-4 py-3 text-right">Posición</th>
              <th className="px-4 py-3 text-right">Clics</th>
              <th className="px-4 py-3 text-right">Impresiones</th>
            </tr>
          </thead>
          <tbody>
            {sortedPages.map((p) => (
              <tr key={`${p.page}-${p.country}`} className="border-t border-[var(--border)]">
                <td className="px-4 py-3 font-mono text-xs">{p.page}</td>
                <td className="px-4 py-3">{p.country}</td>
                <td className="px-4 py-3 text-right tabular-nums">{p.position_avg?.toFixed(1) ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtNum(p.clicks)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtNum(p.impressions)}</td>
              </tr>
            ))}
            {sortedPages.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-4 text-center text-[var(--muted)]">Sin datos para este filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Comparativa URLs: mes de referencia vs mes anterior */}
      <h2 className="mb-3 mt-6 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        Comparativa URLs — {refMonth ?? "—"} vs {prevMonth ?? "sin mes anterior"}
      </h2>
      {prevMonth ? (
        <div className="mb-8 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-[var(--subtle)] text-left text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">URL</th>
                <th className="px-4 py-3 text-right">Posición {prevMonth}</th>
                <th className="px-4 py-3 text-right">Posición {refMonth}</th>
                <th className="px-4 py-3 text-right">Δ posición</th>
                <th className="px-4 py-3 text-right">Δ clics</th>
              </tr>
            </thead>
            <tbody>
              {pagesAtRef.map((p) => {
                const before = pagesAtPrev.find((b) => b.page === p.page && b.country === p.country);
                const deltaPos = before?.position_avg != null && p.position_avg != null ? before.position_avg - p.position_avg : null;
                return (
                  <tr key={`${p.page}-${p.country}-cmp`} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3 font-mono text-xs">{p.page}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--muted)]">{before?.position_avg?.toFixed(1) ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.position_avg?.toFixed(1) ?? "—"}</td>
                    <td className="px-4 py-3 text-right"><Delta value={deltaPos} /></td>
                    <td className="px-4 py-3 text-right"><Delta value={before ? p.clicks - before.clicks : null} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mb-8 text-sm text-[var(--muted)]">No hay mes anterior disponible en el dataset para comparar.</p>
      )}

      {/* Leads por fuente */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        Leads por fuente
      </h2>
      <div className="mb-8 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-[var(--subtle)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Fuente</th>
              <th className="px-4 py-3 text-right">Leads</th>
              <th className="px-4 py-3 text-right">MQL</th>
              <th className="px-4 py-3 text-right">Pipeline €</th>
            </tr>
          </thead>
          <tbody>
            {bySource.map((r) => (
              <tr key={r.source} className="border-t border-[var(--border)]">
                <td className="px-4 py-3">{r.source === "AI_REFERRALS" ? "IA / LLMs (Copilot y otros)" : "Búsqueda orgánica"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtNum(r.leads)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtNum(r.mql)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtEur(r.pipeline)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* AEO — visibilidad por motor */}
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        AEO — visibilidad en motores IA (Copilot prioritario) {refMonth ? `— ${refMonth}` : ""}
      </h2>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {engineAtRef.map(({ engine, visibility, sov }) => (
          <div
            key={engine}
            className={`rounded-xl border p-4 shadow-sm ${engine === "Copilot" ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)] bg-[var(--panel)]"}`}
          >
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
              {engine}{engine === "Copilot" && " ★"}
            </div>
            <div className="mt-1.5 text-xl font-semibold tabular-nums">{fmtPct(visibility)}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">Share of Voice: {fmtPct(sov)}</div>
          </div>
        ))}
      </div>

      {/* Banco de prompts → cita */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        Banco de prompts → cita {refMonth ? `— ${refMonth}` : ""}
      </h2>
      <div className="mb-2 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-[var(--subtle)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Prompt</th>
              <th className="px-4 py-3">Motor</th>
              <th className="px-4 py-3">¿Aparece Dcycle?</th>
              <th className="px-4 py-3">URL citada</th>
              <th className="px-4 py-3">Competidores citados</th>
            </tr>
          </thead>
          <tbody>
            {promptsAtRef.map((p) => (
              <tr key={p.id} className={`border-t border-[var(--border)] ${!p.appeared ? "bg-[var(--warn-bg)]" : ""}`}>
                <td className="px-4 py-3">{p.prompt}</td>
                <td className="px-4 py-3">{p.platform}{p.platform === "Copilot" && " ★"}</td>
                <td className="px-4 py-3">{p.appeared ? "✅ Sí" : "⚠️ No"}</td>
                <td className="px-4 py-3 font-mono text-xs">{p.cited_url ?? "—"}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{p.competitors.map((c) => c.name).join(", ") || "—"}</td>
              </tr>
            ))}
            {promptsAtRef.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-4 text-center text-[var(--muted)]">Sin datos para este filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mb-8 text-xs text-[var(--muted)]">
        ⚠️ = gap: Dcycle no aparece en la respuesta del motor para ese prompt. {citationGaps.length} de {promptsAtRef.length} prompts sin cita este mes.
      </p>

      {/* Comparativa AEO por motor */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        Comparativa AEO por motor — {refMonth ?? "—"} vs {prevMonth ?? "sin mes anterior"}
      </h2>
      {prevMonth ? (
        <div className="mb-8 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-[var(--subtle)] text-left text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Motor</th>
                <th className="px-4 py-3 text-right">Visibilidad {prevMonth}</th>
                <th className="px-4 py-3 text-right">Visibilidad {refMonth}</th>
                <th className="px-4 py-3 text-right">Δ</th>
              </tr>
            </thead>
            <tbody>
              {AI_ENGINES.map((engine) => {
                const now = engineAtRef.find((e) => e.engine === engine)?.visibility ?? null;
                const before = engineAtPrev.find((e) => e.engine === engine)?.visibility ?? null;
                const delta = now !== null && before !== null ? (now - before) * 100 : null;
                return (
                  <tr key={engine} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3">{engine}{engine === "Copilot" && " ★"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--muted)]">{fmtPct(before)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmtPct(now)}</td>
                    <td className="px-4 py-3 text-right"><Delta value={delta} suffix=" pp" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mb-8 text-sm text-[var(--muted)]">No hay mes anterior disponible en el dataset para comparar.</p>
      )}

      {/* Bing WMT — salud técnica de indexación (proxy Copilot) */}
      <Panel title={`Bing WMT — salud de indexación (proxy técnico de visibilidad en Copilot)${refMonth ? ` — ${refMonth}` : ""}`}>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Impresiones</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{fmtNum(bingNow.impressions)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Clics</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{fmtNum(bingNow.clicks)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-[var(--muted)]">Posición media</div>
            <div className="mt-1 flex items-center gap-2 text-lg font-semibold tabular-nums">
              {bingNow.position?.toFixed(1) ?? "—"}
              {prevMonth && bingPrev.position !== null && bingNow.position !== null && (
                <Delta value={bingPrev.position - bingNow.position} />
              )}
            </div>
          </div>
        </div>
      </Panel>
    </>
  );
}
