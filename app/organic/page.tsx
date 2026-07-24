"use client";

import { useState } from "react";
import { PageHeader, Panel } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import {
  mockSeoKeywords, mockSeoPages, mockOrganicDemoLeads, mockOrganicDemoTargets,
  mockAiVisibilityPrompts, mockBingSummary, mockDomainAuthority,
  MONTHS, prevMonth, ORGANIC_TARGET_KEY,
  type OrganicDemoTarget,
} from "@/lib/mock-data";
import {
  filterSeoRange, keywordGap, countOrganicDemos, funnelByStatus, pipelineFromDemos,
  aiVisibilityByEngine, aiShareOfVoice, aiCitationGaps,
  AI_ENGINES, AI_ENGINE_LABELS, LEAD_STATUSES,
  type SeoRangeFilters,
} from "@/lib/seo";
import { fmtEur, fmtNum, fmtPct } from "@/lib/kpis";
import { useLocalState } from "@/lib/store";

// Orgánico (SEO) + AEO — Brief §10, docs/SEO-ORGANICO.md.
// Motor AEO prioritario: Microsoft Copilot (mayoría de clientes Dcycle; se
// nutre del índice de Bing, de ahí el bloque Bing WMT como salud técnica).

const sel = "rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm";
const numCell = "w-24 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-right text-sm tabular-nums";

function Delta({ value, invert = false, suffix = "" }: { value: number | null; invert?: boolean; suffix?: string }) {
  if (value === null || Number.isNaN(value)) return <span className="text-[var(--muted)]">—</span>;
  const good = invert ? value < 0 : value > 0;
  const cls = value === 0 ? "text-[var(--muted)]" : good ? "text-emerald-400" : "text-red-400";
  const arrow = value === 0 ? "→" : value > 0 ? "▲" : "▼";
  return <span className={cls}>{arrow} {Math.abs(value).toFixed(1)}{suffix}</span>;
}

function pacing(pct: number) {
  const cls = pct >= 1 ? "bg-emerald-500/15 text-emerald-300" : pct >= 0.7 ? "bg-amber-500/15 text-amber-300" : "bg-red-500/15 text-red-300";
  return <span className={`rounded px-2 py-1 text-xs ${cls}`}>{fmtPct(pct)}</span>;
}

type SortKey = "position" | "clicks" | "impressions";

export default function OrganicPage() {
  const [range, setRange] = useState<SeoRangeFilters>({ country: "", from: MONTHS[0], to: MONTHS[MONTHS.length - 1] });
  const [targets, setTargets] = useLocalState<OrganicDemoTarget[]>(ORGANIC_TARGET_KEY, mockOrganicDemoTargets);
  const [leadStatusOverrides, setLeadStatusOverrides] = useLocalState<Record<string, string>>("gtm.organicLeadStatus.v1", {});
  const [sortKey, setSortKey] = useState<SortKey>("position");

  const countries = [...new Set(mockSeoPages.map((p) => p.country))].sort();
  const prev = prevMonth(range.to);

  // ── Rango [from, to]: acumulados de periodo (sesiones, demos, pipeline) ──
  const pagesInRange = filterSeoRange(mockSeoPages, range);
  const leads = filterSeoRange(mockOrganicDemoLeads, range).map((l) => ({
    ...l,
    leadStatus: leadStatusOverrides[l.email] ?? l.leadStatus,
  }));

  const nonBrandedSessions = pagesInRange.reduce((s, p) => s + p.organicSessions, 0);
  const pipelineSeo = pipelineFromDemos(leads);

  // ── Snapshot al mes "hasta": rankings/posiciones (no tiene sentido sumarlos) ──
  const keywordsAtTo = mockSeoKeywords.filter((k) => k.month === range.to && (!range.country || k.country === range.country));
  const pagesAtTo = mockSeoPages.filter((p) => p.month === range.to && (!range.country || p.country === range.country));
  const promptsAtTo = mockAiVisibilityPrompts.filter((p) => p.month === range.to && (!range.country || p.country === range.country));
  const pagesAtPrev = prev ? mockSeoPages.filter((p) => p.month === prev && (!range.country || p.country === range.country)) : [];
  const promptsAtPrev = prev ? mockAiVisibilityPrompts.filter((p) => p.month === prev && (!range.country || p.country === range.country)) : [];

  const top3 = keywordsAtTo.filter((k) => k.isStrategic && k.position <= 3 && !k.isBranded).length;
  const kpiCards = [
    { label: "Tráfico orgánico non-branded (sesiones)", value: fmtNum(nonBrandedSessions) },
    { label: "Domain Authority (DA)", value: `${mockDomainAuthority.value} (+${mockDomainAuthority.delta})` },
    { label: "Keywords estratégicas en Top 3", value: fmtNum(top3) },
    { label: "Demos orgánicas", value: fmtNum(leads.length) },
    { label: "Pipeline SEO €", value: fmtEur(pipelineSeo) },
  ];

  const sortedPages = [...pagesAtTo].sort((a, b) => (sortKey === "position" ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey]));

  // ── Objetivo de demos orgánicas (target editable, real 🔒 calculado) ──
  const visibleTargets = targets
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => t.month === range.to && (!range.country || t.country === range.country));
  const updateTarget = (i: number, value: number) =>
    setTargets(targets.map((t, idx) => (idx === i ? { ...t, targetDemos: value } : t)));

  // ── Lead status funnel ──
  const funnel = funnelByStatus(leads);
  const maxFunnel = Math.max(1, funnel[0]?.count ?? 1);
  const setLeadStatus = (email: string, status: string) =>
    setLeadStatusOverrides({ ...leadStatusOverrides, [email]: status });

  // ── AEO por motor ──
  const visibilityAtTo = aiVisibilityByEngine(promptsAtTo);
  const visibilityAtPrev = aiVisibilityByEngine(promptsAtPrev);
  const engineCards = AI_ENGINES.map((engine) => {
    const now = visibilityAtTo.find((v) => v.engine === engine);
    return { engine, visibility: now?.visibility ?? null, sov: aiShareOfVoice(promptsAtTo, engine) };
  });
  const citationGaps = aiCitationGaps(promptsAtTo);

  // ── Bing WMT (salud técnica de indexación, proxy Copilot) ──
  const bingAtTo = filterSeoRange(mockBingSummary, { country: range.country, from: range.to, to: range.to });
  const bingAtPrev = prev ? filterSeoRange(mockBingSummary, { country: range.country, from: prev, to: prev }) : [];
  const bingSum = (rows: typeof mockBingSummary) => ({
    impressions: rows.reduce((s, r) => s + r.impressions, 0),
    clicks: rows.reduce((s, r) => s + r.clicks, 0),
    position: rows.length ? rows.reduce((s, r) => s + r.position, 0) / rows.length : null,
  });
  const bingNow = bingSum(bingAtTo);
  const bingPrev = bingSum(bingAtPrev);

  return (
    <div>
      <PageHeader
        title="Orgánico (SEO) + AEO"
        subtitle="SEO non-branded conectado hasta pipeline € y deals, y AEO por motor con Copilot como prioridad (mayoría de clientes lo usan; se nutre del índice de Bing)."
        phase="F5"
      />
      <StatusBanner />

      {/* Filtros: país + rango de fechas */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Filtros</span>
        <select className={sel} value={range.country} onChange={(e) => setRange({ ...range, country: e.target.value })}>
          <option value="">Todos los países</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          Desde
          <select className={sel} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })}>
            {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          Hasta
          <select className={sel} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })}>
            {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        {(range.country || range.from !== MONTHS[0] || range.to !== MONTHS[MONTHS.length - 1]) && (
          <button
            onClick={() => setRange({ country: "", from: MONTHS[0], to: MONTHS[MONTHS.length - 1] })}
            className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-[var(--muted)] hover:bg-white/10"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* KPIs cabecera */}
      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {kpiCards.map((c) => (
          <div key={c.label} className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5">
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{c.label}</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{c.value}</div>
          </div>
        ))}
      </div>

      {/* ★ Objetivo de demos orgánicas */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        ★ Objetivo de demos orgánicas — {range.to}
      </h2>
      <div className="mb-8 overflow-hidden rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--panel)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">País</th>
              <th className="px-4 py-3 text-right">Objetivo ✏️</th>
              <th className="px-4 py-3 text-right">Real 🔒</th>
              <th className="px-4 py-3 text-right">% cumplimiento</th>
            </tr>
          </thead>
          <tbody>
            {visibleTargets.map(({ t, i }) => {
              const real = countOrganicDemos(mockOrganicDemoLeads, { country: t.country, month: t.month });
              return (
                <tr key={i} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3">{t.country}</td>
                  <td className="px-4 py-3 text-right">
                    <input type="number" className={numCell} value={t.targetDemos} onChange={(e) => updateTarget(i, +e.target.value)} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--muted)]">{fmtNum(real)}</td>
                  <td className="px-4 py-3 text-right">{pacing(t.targetDemos ? real / t.targetDemos : 0)}</td>
                </tr>
              );
            })}
            {visibleTargets.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-4 text-center text-[var(--muted)]">Sin objetivo definido para {range.to} con este filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ★ Páginas transaccionales por keyword */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        ★ Páginas transaccionales por keyword — {range.to}
      </h2>
      <div className="mb-8 overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--panel)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Keyword</th>
              <th className="px-4 py-3">Intención</th>
              <th className="px-4 py-3">Página objetivo</th>
              <th className="px-4 py-3">URL que rankea</th>
              <th className="px-4 py-3 text-right">Posición</th>
              <th className="px-4 py-3 text-right">Demos</th>
            </tr>
          </thead>
          <tbody>
            {keywordsAtTo.map((k) => {
              const gap = keywordGap(k) && k.intent !== "branded";
              return (
                <tr key={`${k.keyword}-${k.country}`} className={`border-t border-[var(--border)] ${gap ? "bg-amber-500/10" : ""}`}>
                  <td className="px-4 py-3">{k.keyword}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{k.intent}</td>
                  <td className="px-4 py-3 font-mono text-xs">{k.targetUrl}</td>
                  <td className={`px-4 py-3 font-mono text-xs ${gap ? "text-amber-300" : ""}`}>{k.rankingUrl}{gap && " ⚠️"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{k.position.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtNum(k.organicDemos)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mb-8 -mt-6 text-xs text-[var(--muted)]">⚠️ = gap: la página transaccional objetivo no es la que rankea de verdad.</p>

      {/* ★ URLs mejor posicionadas */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        ★ URLs mejor posicionadas — {range.to}
      </h2>
      <div className="mb-3 flex gap-2 text-xs">
        {(["position", "clicks", "impressions"] as SortKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setSortKey(k)}
            className={`rounded px-2 py-1 ${sortKey === k ? "bg-[var(--accent)]/20 text-[var(--accent)]" : "bg-white/5 text-[var(--muted)] hover:bg-white/10"}`}
          >
            Ordenar por {k}
          </button>
        ))}
      </div>
      <div className="mb-8 overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--panel)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">URL</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3 text-right">Posición</th>
              <th className="px-4 py-3 text-right">Clics</th>
              <th className="px-4 py-3 text-right">Impresiones</th>
              <th className="px-4 py-3 text-right">Demos</th>
            </tr>
          </thead>
          <tbody>
            {sortedPages.map((p) => (
              <tr key={`${p.url}-${p.country}`} className="border-t border-[var(--border)]">
                <td className="px-4 py-3 font-mono text-xs">{p.url}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{p.isTransactional ? "Transaccional" : "Informacional"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{p.position.toFixed(1)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtNum(p.clicks)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtNum(p.impressions)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmtNum(p.organicDemos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Tabla comparativa URLs: mes vs mes anterior */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        Comparativa URLs — {range.to} vs {prev ?? "sin mes anterior"}
      </h2>
      {prev ? (
        <div className="mb-8 overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--panel)] text-left text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">URL</th>
                <th className="px-4 py-3 text-right">Posición {prev}</th>
                <th className="px-4 py-3 text-right">Posición {range.to}</th>
                <th className="px-4 py-3 text-right">Δ posición</th>
                <th className="px-4 py-3 text-right">Δ clics</th>
              </tr>
            </thead>
            <tbody>
              {pagesAtTo.map((p) => {
                const before = pagesAtPrev.find((b) => b.url === p.url && b.country === p.country);
                return (
                  <tr key={`${p.url}-${p.country}-cmp`} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3 font-mono text-xs">{p.url}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--muted)]">{before ? before.position.toFixed(1) : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{p.position.toFixed(1)}</td>
                    <td className="px-4 py-3 text-right">{before ? <Delta value={before.position - p.position} /> : "—"}</td>
                    <td className="px-4 py-3 text-right">{before ? <Delta value={p.clicks - before.clicks} /> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mb-8 text-sm text-[var(--muted)]">No hay mes anterior disponible en el dataset para comparar.</p>
      )}

      {/* ★ Lead status de demos orgánicas */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        ★ Lead status de demos orgánicas — {range.from} a {range.to}
      </h2>
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Embudo">
          <div className="space-y-2">
            {funnel.map((f) => (
              <div key={f.status} className="flex items-center gap-3">
                <div className="w-28 text-sm text-[var(--muted)]">{f.status}</div>
                <div className="h-6 flex-1 rounded bg-white/5">
                  <div className="h-6 rounded bg-[var(--accent)]/60" style={{ width: `${Math.max((f.count / maxFunnel) * 100, 4)}%` }} />
                </div>
                <div className="w-12 text-right text-sm tabular-nums">{f.count}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 border-t border-[var(--border)] pt-3 text-sm">
            <span className="text-[var(--muted)]">Pipeline SEO/AEO: </span>{fmtEur(pipelineSeo)}
          </div>
        </Panel>
        <Panel title="Contactos (lead status editable)">
          <div className="space-y-2">
            {leads.map((l) => (
              <div key={l.email} className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-2 last:border-0">
                <div className="min-w-0">
                  <div className="truncate text-sm">{l.company}</div>
                  <div className="truncate text-xs text-[var(--muted)]">{l.email} · {l.source === "AI_REFERRALS" ? "IA/LLM" : "Orgánico"}</div>
                </div>
                <select
                  className={sel}
                  value={l.leadStatus}
                  onChange={(e) => setLeadStatus(l.email, e.target.value)}
                >
                  {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            ))}
            {leads.length === 0 && <p className="text-sm text-[var(--muted)]">Sin demos orgánicas en este rango/país.</p>}
          </div>
        </Panel>
      </div>

      {/* AEO — visibilidad en motores IA */}
      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        AEO — visibilidad en motores IA (Copilot prioritario) — {range.to}
      </h2>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {engineCards.map(({ engine, visibility, sov }) => (
          <div key={engine} className={`rounded-lg border p-5 ${engine === "copilot" ? "border-[var(--accent)]/50 bg-[var(--accent)]/5" : "border-[var(--border)] bg-[var(--panel)]"}`}>
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">
              {AI_ENGINE_LABELS[engine]}{engine === "copilot" && " ★"}
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{fmtPct(visibility)}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">Share of Voice: {fmtPct(sov)}</div>
          </div>
        ))}
      </div>

      {/* ★ Banco de prompts → cita */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        ★ Banco de prompts → cita — {range.to}
      </h2>
      <div className="mb-8 overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--panel)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Prompt</th>
              <th className="px-4 py-3">Motor</th>
              <th className="px-4 py-3">¿Aparece Dcycle?</th>
              <th className="px-4 py-3">URL citada</th>
              <th className="px-4 py-3">Competidores citados</th>
            </tr>
          </thead>
          <tbody>
            {promptsAtTo.map((p, idx) => {
              const gap = !p.appearsDcycle;
              return (
                <tr key={idx} className={`border-t border-[var(--border)] ${gap ? "bg-amber-500/10" : ""}`}>
                  <td className="px-4 py-3">{p.prompt}</td>
                  <td className="px-4 py-3">{AI_ENGINE_LABELS[p.engine]}{p.engine === "copilot" && " ★"}</td>
                  <td className="px-4 py-3">{p.appearsDcycle ? "✅ Sí" : "⚠️ No"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{p.citedUrl ?? "—"}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{p.competitorsCited.join(", ") || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mb-8 -mt-6 text-xs text-[var(--muted)]">
        ⚠️ = gap: Dcycle no aparece en la respuesta del motor para ese prompt. {citationGaps.length} de {promptsAtTo.length} prompts sin cita este mes.
      </p>

      {/* Comparativa AEO por motor: mes vs mes anterior */}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
        Comparativa AEO por motor — {range.to} vs {prev ?? "sin mes anterior"}
      </h2>
      {prev ? (
        <div className="mb-8 overflow-hidden rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--panel)] text-left text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Motor</th>
                <th className="px-4 py-3 text-right">Visibilidad {prev}</th>
                <th className="px-4 py-3 text-right">Visibilidad {range.to}</th>
                <th className="px-4 py-3 text-right">Δ</th>
              </tr>
            </thead>
            <tbody>
              {AI_ENGINES.map((engine) => {
                const now = visibilityAtTo.find((v) => v.engine === engine)?.visibility ?? null;
                const before = visibilityAtPrev.find((v) => v.engine === engine)?.visibility ?? null;
                const delta = now !== null && before !== null ? (now - before) * 100 : null;
                return (
                  <tr key={engine} className="border-t border-[var(--border)]">
                    <td className="px-4 py-3">{AI_ENGINE_LABELS[engine]}{engine === "copilot" && " ★"}</td>
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
      <Panel title="Bing WMT — salud de indexación (proxy técnico de visibilidad en Copilot)">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Impresiones</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{fmtNum(bingNow.impressions)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Clics</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{fmtNum(bingNow.clicks)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-[var(--muted)]">Posición media</div>
            <div className="mt-1 flex items-center gap-2 text-xl font-semibold tabular-nums">
              {bingNow.position?.toFixed(1) ?? "—"}
              {prev && bingPrev.position !== null && bingNow.position !== null && (
                <Delta value={bingPrev.position - bingNow.position} />
              )}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
