"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Wallet,
  TrendingUp,
  Trophy,
  ArrowRight,
  AlertTriangle,
  BarChart3,
  Megaphone,
  Globe,
  Target,
} from "lucide-react";
import {
  sumMetrics,
  groupBy,
  type CampaignRow,
  type ForecastRow,
} from "@/lib/mock-data";
import { fmtEur, fmtNum, fmtPct, roi, cpl, cpmql } from "@/lib/kpis";
import { Stat } from "@/components/ui/Stat";
import { Tooltip } from "@/components/ui/Tooltip";

// Orígenes del dato — reutilizados en tooltips (coherentes con Data Health).
const SRC = {
  spend: "Coste real de paid media (LinkedIn Ads + Google Ads) vía Supermetrics.",
  funnel: "Del CRM (HubSpot): contactos y su etapa de ciclo de vida (Lead → MQL → SQL).",
  pipeline: "Suma del importe de deals atribuidos, de HubSpot. Atribución paid↔CRM por utm_campaign.",
  won: "Importe de deals en estado Closed Won (HubSpot).",
  roi: "(Pipeline € − Inversión) / Inversión.",
};

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function DashboardClient({
  campaigns,
  targets,
}: {
  campaigns: CampaignRow[];
  targets: ForecastRow[];
}) {
  const [scope, setScope] = useState<"month" | "ytd">("month");

  const months = useMemo(
    () => [...new Set(campaigns.map((c) => c.month))].sort(),
    [campaigns],
  );
  const tm = thisMonth();
  const activeMonth = months.includes(tm) ? tm : (months[months.length - 1] ?? tm);
  const year = activeMonth.slice(0, 4);

  const inScope = (m: string) => (scope === "month" ? m === activeMonth : m.startsWith(year));

  const rows = useMemo(() => campaigns.filter((c) => inScope(c.month)), [campaigns, scope, activeMonth]);
  const t = useMemo(() => sumMetrics(rows), [rows]);

  const targetRows = useMemo(() => targets.filter((r) => inScope(r.month)), [targets, scope, activeMonth]);
  const targetPipeline = targetRows.reduce((s, r) => s + r.targetPipeline, 0);
  const targetSpend = targetRows.reduce((s, r) => s + r.targetSpend, 0);

  const byChannel = useMemo(
    () =>
      groupBy(rows, "channel")
        .map(([name, m]) => ({ name, m }))
        .sort((a, b) => b.m.pipeline - a.m.pipeline)
        .filter((c) => c.m.spend > 0 || c.m.pipeline > 0),
    [rows],
  );
  const maxPipe = Math.max(1, ...byChannel.map((c) => c.m.pipeline));

  const pipelinePace = targetPipeline > 0 ? t.pipeline / targetPipeline : null;
  const spendPace = targetSpend > 0 ? t.spend / targetSpend : null;

  // Alertas simples: canal con sobrecoste vs objetivo o pipeline flojo.
  const overspend = byChannel.filter((c) => {
    const tgt = targetRows.filter((r) => r.channel === c.name).reduce((s, r) => s + r.targetSpend, 0);
    return tgt > 0 && c.m.spend > tgt;
  });

  const scopeLabel = scope === "month" ? `mes ${activeMonth}` : `año ${year} (YTD)`;

  return (
    <>
      {/* Toggle de alcance */}
      <div className="mb-6 flex w-fit items-center gap-1 rounded-lg bg-[var(--subtle)] p-1">
        <ScopeTab label="Este mes" active={scope === "month"} onClick={() => setScope("month")} />
        <ScopeTab label="Año (YTD)" active={scope === "ytd"} onClick={() => setScope("ytd")} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Inversión"
          value={fmtEur(t.spend)}
          help={SRC.spend}
          icon={<Wallet className="h-4 w-4" />}
          hint={targetSpend > 0 ? `Obj ${fmtEur(targetSpend)} · ${fmtPct(spendPace)}` : undefined}
        />
        <Stat
          label="Pipeline generado"
          value={fmtEur(t.pipeline)}
          help={SRC.pipeline}
          icon={<TrendingUp className="h-4 w-4" />}
          hint={targetPipeline > 0 ? `Obj ${fmtEur(targetPipeline)} · ${fmtPct(pipelinePace)}` : undefined}
        />
        <Stat
          label="ROI"
          value={fmtPct(roi(t))}
          icon={<Target className="h-4 w-4" />}
          hint="Pipeline € por € invertido"
        />
        <Stat
          label="Closed Won"
          value={fmtEur(t.closedWon)}
          icon={<Trophy className="h-4 w-4" />}
        />
      </div>

      {/* Funnel + pacing */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-1.5">
            <h3 className="text-sm font-semibold">Embudo · {scopeLabel}</h3>
            <Tooltip content={SRC.funnel} />
          </div>
          <FunnelBar t={t} />
        </div>

        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold">Ritmo vs objetivo</h3>
          <PaceRow label="Pipeline" actual={t.pipeline} target={targetPipeline} mode="pipeline" />
          <PaceRow label="Inversión" actual={t.spend} target={targetSpend} mode="spend" />
          <p className="mt-3 text-xs text-[var(--muted)]">
            La línea marca el objetivo. Pipeline: cuanto más cerca o por encima, mejor.
            Inversión: pasar de la línea es sobrecoste.
          </p>
        </div>
      </div>

      {/* Top canales + alertas */}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Pipeline por canal</h3>
            <Link href="/metrics" className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline">
              Ver métricas <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {byChannel.length === 0 ? (
            <Empty>Sin actividad en {scopeLabel}.</Empty>
          ) : (
            <div className="space-y-3">
              {byChannel.map((c) => (
                <div key={c.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium">{c.name}</span>
                    <span className="tabular-nums text-[var(--muted)]">
                      {fmtEur(c.m.pipeline)} · CPL {fmtEur(cpl(c.m))} · CPMQL {fmtEur(cpmql(c.m))}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[var(--subtle)]">
                    <div
                      className="h-full rounded-full bg-[var(--brand)]"
                      style={{ width: `${(c.m.pipeline / maxPipe) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="mb-4 text-sm font-semibold">Alertas</h3>
          {overspend.length === 0 ? (
            <Empty>Sin sobrecostes vs objetivo 🎉</Empty>
          ) : (
            <ul className="space-y-2">
              {overspend.map((c) => (
                <li
                  key={c.name}
                  className="flex items-start gap-2 rounded-lg bg-[var(--warn-bg)] px-3 py-2 text-xs text-[var(--warn-text)]"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    <strong>{c.name}</strong>: inversión por encima del objetivo en {scopeLabel}.
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Accesos directos */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickLink href="/overview" icon={<Target className="h-4 w-4" />} label="Overview vs Target" />
        <QuickLink href="/metrics" icon={<BarChart3 className="h-4 w-4" />} label="Métricas Canal/País" />
        <QuickLink href="/paid" icon={<Megaphone className="h-4 w-4" />} label="Detalle Campaña" />
        <QuickLink href="/organic" icon={<Globe className="h-4 w-4" />} label="Orgánico + AEO" />
      </div>
    </>
  );
}

function ScopeTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
        active ? "bg-[var(--panel)] font-medium text-[var(--text)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]"
      }`}
    >
      {label}
    </button>
  );
}

function FunnelBar({ t }: { t: ReturnType<typeof sumMetrics> }) {
  const steps = [
    { label: "Leads", value: t.leads },
    { label: "MQL", value: t.mql },
    { label: "SQL", value: t.sql },
  ];
  const max = Math.max(1, t.leads);
  return (
    <div className="space-y-2.5">
      {steps.map((s, i) => {
        const prev = i === 0 ? null : steps[i - 1].value;
        const conv = prev && prev > 0 ? s.value / prev : null;
        return (
          <div key={s.label} className="flex items-center gap-3">
            <span className="w-14 shrink-0 text-xs uppercase tracking-wide text-[var(--muted)]">{s.label}</span>
            <div className="h-6 flex-1 overflow-hidden rounded-md bg-[var(--subtle)]">
              <div
                className="flex h-full items-center rounded-md bg-[var(--color-blue-400)] px-2 text-xs font-medium text-white"
                style={{ width: `${Math.max((s.value / max) * 100, 8)}%` }}
              >
                {fmtNum(s.value)}
              </div>
            </div>
            <span className="w-16 shrink-0 text-right text-xs tabular-nums text-[var(--muted)]">
              {conv === null ? "—" : `${fmtPct(conv)} conv`}
            </span>
          </div>
        );
      })}
      <div className="flex items-center justify-between border-t border-[var(--border)] pt-3 text-sm">
        <span className="text-[var(--muted)]">Pipeline €</span>
        <span className="font-semibold tabular-nums text-[var(--brand)]">{fmtEur(t.pipeline)}</span>
      </div>
    </div>
  );
}

// Barra de ritmo con marca de objetivo. La escala llega al 125% del objetivo,
// con una línea vertical en el 100% (la meta), de modo que se ve de un vistazo
// si vamos por debajo o por encima. Umbrales suaves (un 84% ya no es "rojo").
const PACE_SCALE = 1.25;
function PaceRow({
  label,
  actual,
  target,
  mode,
}: {
  label: string;
  actual: number;
  target: number;
  mode: "pipeline" | "spend";
}) {
  const pct = target > 0 ? actual / target : null;
  const width = pct === null ? 0 : (Math.min(pct, PACE_SCALE) / PACE_SCALE) * 100;
  const tone =
    pct === null
      ? "border"
      : mode === "spend"
        ? pct > 1.1
          ? "error"
          : pct > 1
            ? "warn"
            : "good"
        : pct >= 0.95
          ? "good"
          : pct >= 0.7
            ? "warn"
            : "error";
  const barCls = {
    good: "bg-[var(--good-solid)]",
    warn: "bg-[var(--warn-solid)]",
    error: "bg-[var(--error-solid)]",
    border: "bg-[var(--border)]",
  }[tone];
  const chipCls = {
    good: "bg-[var(--good-bg)] text-[var(--good-text)]",
    warn: "bg-[var(--warn-bg)] text-[var(--warn-text)]",
    error: "bg-[var(--error-bg)] text-[var(--error-text)]",
    border: "text-[var(--muted)]",
  }[tone];

  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-[var(--muted)]">{label}</span>
        <span className="flex items-center gap-2">
          <span className="text-xs tabular-nums text-[var(--faint)]">
            {fmtEur(actual)} / {fmtEur(target)}
          </span>
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${chipCls}`}>
            {pct === null ? "—" : fmtPct(pct)}
          </span>
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-[var(--subtle)]">
        <div className={`h-full rounded-full ${barCls}`} style={{ width: `${width}%` }} />
        {/* marca del objetivo (100%) */}
        <div
          className="absolute top-0 h-full w-px bg-[var(--text-secondary)]"
          style={{ left: `${(1 / PACE_SCALE) * 100}%` }}
        />
      </div>
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="card flex items-center gap-2.5 p-3 text-sm font-medium transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
    >
      <span className="text-[var(--faint)]">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-6 text-center text-sm text-[var(--muted)]">{children}</div>;
}
