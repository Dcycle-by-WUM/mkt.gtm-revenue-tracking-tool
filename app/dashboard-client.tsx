"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Wallet,
  TrendingUp,
  Trophy,
  AlertTriangle,
  BarChart3,
  Megaphone,
  Globe,
  Target,
  MoreVertical,
  Plus,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import { sumMetrics, groupBy, type CampaignRow, type ForecastRow } from "@/lib/mock-data";
import { fmtEur, fmtNum, fmtPct, roi, cpl, cpmql } from "@/lib/kpis";
import { Tooltip } from "@/components/ui/Tooltip";

// Orígenes del dato — reutilizados en tooltips (coherentes con Data Health).
const SRC = {
  spend: "Coste real de paid media (LinkedIn Ads + Google Ads) vía Supermetrics.",
  funnel: "Del CRM (HubSpot): contactos y su etapa de ciclo de vida (Lead → MQL → SQL).",
  pipeline: "Suma del importe de deals atribuidos, de HubSpot. Atribución paid↔CRM por utm_campaign.",
};

const LS_KEY = "gtm-dashboard-modules-v1";

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Orden por defecto de módulos visibles. `topCampaigns` no está → se puede
// añadir desde "＋ Añadir módulo" (demuestra el patrón de personalización).
const DEFAULT_ORDER = ["kpis", "funnel", "pace", "channels", "alerts", "quicklinks"];

export function DashboardClient({
  campaigns,
  targets,
}: {
  campaigns: CampaignRow[];
  targets: ForecastRow[];
}) {
  const [scope, setScope] = useState<"month" | "ytd">("month");

  // Layout personalizable persistido en localStorage (por navegador).
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setOrder(parsed.filter((id) => typeof id === "string"));
      }
    } catch {
      /* ignora localStorage no disponible */
    }
    setHydrated(true);
  }, []);
  const persist = (next: string[]) => {
    setOrder(next);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {
      /* noop */
    }
  };

  const months = useMemo(() => [...new Set(campaigns.map((c) => c.month))].sort(), [campaigns]);
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

  const byCampaign = useMemo(
    () =>
      groupBy(rows, "campaign")
        .map(([name, m]) => ({ name, m }))
        .filter((c) => c.m.pipeline > 0)
        .sort((a, b) => b.m.pipeline - a.m.pipeline)
        .slice(0, 5),
    [rows],
  );

  const pipelinePace = targetPipeline > 0 ? t.pipeline / targetPipeline : null;
  const spendPace = targetSpend > 0 ? t.spend / targetSpend : null;

  const overspend = byChannel.filter((c) => {
    const tgt = targetRows.filter((r) => r.channel === c.name).reduce((s, r) => s + r.targetSpend, 0);
    return tgt > 0 && c.m.spend > tgt;
  });

  const scopeLabel = scope === "month" ? `mes ${activeMonth}` : `año ${year} (YTD)`;

  // Registro de módulos: cada uno con título, ancho (col-span en lg) y contenido.
  const MODULES: Record<string, { title: string; span: number; node: React.ReactNode }> = {
    kpis: {
      title: "Indicadores",
      span: 3,
      node: (
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
          <KpiCell label="Inversión" value={fmtEur(t.spend)} help={SRC.spend} icon={<Wallet className="h-4 w-4" />}
            hint={targetSpend > 0 ? `Obj ${fmtEur(targetSpend)} · ${fmtPct(spendPace)}` : undefined} />
          <KpiCell label="Pipeline generado" value={fmtEur(t.pipeline)} help={SRC.pipeline} icon={<TrendingUp className="h-4 w-4" />}
            hint={targetPipeline > 0 ? `Obj ${fmtEur(targetPipeline)} · ${fmtPct(pipelinePace)}` : undefined} />
          <KpiCell label="ROI" value={fmtPct(roi(t))} icon={<Target className="h-4 w-4" />} hint="Pipeline € por € invertido" />
          <KpiCell label="Closed Won" value={fmtEur(t.closedWon)} icon={<Trophy className="h-4 w-4" />} />
        </div>
      ),
    },
    funnel: {
      title: `Embudo · ${scopeLabel}`,
      span: 2,
      node: <FunnelBar t={t} help={SRC.funnel} />,
    },
    pace: {
      title: "Ritmo vs objetivo",
      span: 1,
      node: (
        <>
          <PaceRow label="Pipeline" actual={t.pipeline} target={targetPipeline} mode="pipeline" />
          <PaceRow label="Inversión" actual={t.spend} target={targetSpend} mode="spend" />
          <p className="mt-3 text-xs text-[var(--muted)]">
            La línea marca el objetivo. Pipeline: cuanto más cerca o por encima, mejor. Inversión: pasar de la línea es sobrecoste.
          </p>
        </>
      ),
    },
    channels: {
      title: "Pipeline por canal",
      span: 2,
      node:
        byChannel.length === 0 ? (
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
                  <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${(c.m.pipeline / maxPipe) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        ),
    },
    alerts: {
      title: "Alertas",
      span: 1,
      node:
        overspend.length === 0 ? (
          <Empty>Sin sobrecostes vs objetivo 🎉</Empty>
        ) : (
          <ul className="space-y-2">
            {overspend.map((c) => (
              <li key={c.name} className="flex items-start gap-2 rounded-lg bg-[var(--warn-bg)] px-3 py-2 text-xs text-[var(--warn-text)]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span><strong>{c.name}</strong>: inversión por encima del objetivo en {scopeLabel}.</span>
              </li>
            ))}
          </ul>
        ),
    },
    topCampaigns: {
      title: "Top campañas por pipeline",
      span: 3,
      node:
        byCampaign.length === 0 ? (
          <Empty>Sin campañas con pipeline en {scopeLabel}.</Empty>
        ) : (
          <div className="space-y-2.5">
            {byCampaign.map((c) => (
              <div key={c.name} className="flex items-center justify-between gap-4 text-sm">
                <span className="truncate font-mono text-xs">{c.name}</span>
                <span className="shrink-0 tabular-nums text-[var(--muted)]">{fmtEur(c.m.pipeline)}</span>
              </div>
            ))}
          </div>
        ),
    },
    quicklinks: {
      title: "Accesos directos",
      span: 3,
      node: (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <QuickLink href="/overview" icon={<Target className="h-4 w-4" />} label="Overview vs Target" />
          <QuickLink href="/metrics" icon={<BarChart3 className="h-4 w-4" />} label="Métricas Canal/País" />
          <QuickLink href="/paid" icon={<Megaphone className="h-4 w-4" />} label="Detalle Campaña" />
          <QuickLink href="/organic" icon={<Globe className="h-4 w-4" />} label="Orgánico + AEO" />
        </div>
      ),
    },
  };

  const allIds = Object.keys(MODULES);
  const visible = order.filter((id) => MODULES[id]);
  const hidden = allIds.filter((id) => !visible.includes(id));

  const move = (id: string, dir: -1 | 1) => {
    const i = visible.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= visible.length) return;
    const next = [...visible];
    [next[i], next[j]] = [next[j], next[i]];
    persist(next);
  };
  const remove = (id: string) => persist(visible.filter((x) => x !== id));
  const add = (id: string) => persist([...visible, id]);
  const reset = () => persist(DEFAULT_ORDER);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-fit items-center gap-1 rounded-lg bg-[var(--subtle)] p-1">
          <ScopeTab label="Este mes" active={scope === "month"} onClick={() => setScope("month")} />
          <ScopeTab label="Año (YTD)" active={scope === "ytd"} onClick={() => setScope("ytd")} />
        </div>
        {hydrated && <AddModuleMenu hidden={hidden} modules={MODULES} onAdd={add} onReset={reset} />}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {visible.map((id, i) => {
          const mod = MODULES[id];
          const spanCls = mod.span === 3 ? "lg:col-span-3" : mod.span === 2 ? "lg:col-span-2" : "lg:col-span-1";
          return (
            <div key={id} className={spanCls}>
              <ModuleCard
                title={mod.title}
                canUp={i > 0}
                canDown={i < visible.length - 1}
                onUp={() => move(id, -1)}
                onDown={() => move(id, 1)}
                onRemove={() => remove(id)}
              >
                {mod.node}
              </ModuleCard>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ── Wrapper de módulo con menú ⋯ (Subir / Bajar / Quitar) ──────────────────
function ModuleCard({
  title,
  children,
  canUp,
  canDown,
  onUp,
  onDown,
  onRemove,
}: {
  title: string;
  children: React.ReactNode;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card flex h-full flex-col p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-md p-1 text-[var(--faint)] transition-colors hover:bg-[var(--subtle)] hover:text-[var(--text)]"
            aria-label="Opciones del módulo"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {open && (
            <>
              <button className="fixed inset-0 z-40 cursor-default" aria-hidden onClick={() => setOpen(false)} />
              <div className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)] py-1 text-sm shadow-[var(--shadow-lg)]">
                <MenuItem disabled={!canUp} onClick={() => { onUp(); setOpen(false); }} icon={<ArrowUp className="h-3.5 w-3.5" />}>Subir</MenuItem>
                <MenuItem disabled={!canDown} onClick={() => { onDown(); setOpen(false); }} icon={<ArrowDown className="h-3.5 w-3.5" />}>Bajar</MenuItem>
                <MenuItem onClick={() => { onRemove(); setOpen(false); }} icon={<X className="h-3.5 w-3.5" />} danger>Quitar del dashboard</MenuItem>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function MenuItem({
  children,
  onClick,
  icon,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors disabled:opacity-40 ${
        danger ? "text-[var(--error-text)] hover:bg-[var(--error-bg)]" : "text-[var(--text-secondary)] hover:bg-[var(--subtle)]"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

function AddModuleMenu({
  hidden,
  modules,
  onAdd,
  onReset,
}: {
  hidden: string[];
  modules: Record<string, { title: string }>;
  onAdd: (id: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)]"
      >
        <Plus className="h-4 w-4" /> Añadir módulo
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-60 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel)] py-1 text-sm shadow-[var(--shadow-lg)]">
            {hidden.length === 0 ? (
              <div className="px-3 py-2 text-xs text-[var(--muted)]">Todos los módulos ya están en el dashboard.</div>
            ) : (
              hidden.map((id) => (
                <button
                  key={id}
                  onClick={() => { onAdd(id); setOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[var(--text-secondary)] transition-colors hover:bg-[var(--subtle)]"
                >
                  <Plus className="h-3.5 w-3.5 text-[var(--faint)]" /> {modules[id].title}
                </button>
              ))
            )}
            <div className="my-1 border-t border-[var(--border)]" />
            <button
              onClick={() => { onReset(); setOpen(false); }}
              className="w-full px-3 py-1.5 text-left text-xs text-[var(--muted)] transition-colors hover:bg-[var(--subtle)]"
            >
              Restablecer al diseño por defecto
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Piezas ────────────────────────────────────────────────────────────────
function KpiCell({
  label,
  value,
  help,
  hint,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  help?: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        {icon && <span className="text-[var(--faint)]">{icon}</span>}
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</span>
        {help && <Tooltip content={help} />}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div>}
    </div>
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

function FunnelBar({ t, help }: { t: ReturnType<typeof sumMetrics>; help: string }) {
  const steps = [
    { label: "Leads", value: t.leads },
    { label: "MQL", value: t.mql },
    { label: "SQL", value: t.sql },
  ];
  const max = Math.max(1, t.leads);
  return (
    <div className="space-y-2.5">
      <div className="-mt-2 mb-1 flex items-center gap-1.5 text-xs text-[var(--muted)]">
        Volumen del embudo <Tooltip content={help} />
      </div>
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
  const barCls = { good: "bg-[var(--good-solid)]", warn: "bg-[var(--warn-solid)]", error: "bg-[var(--error-solid)]", border: "bg-[var(--border)]" }[tone];
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
          <span className="text-xs tabular-nums text-[var(--faint)]">{fmtEur(actual)} / {fmtEur(target)}</span>
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${chipCls}`}>
            {pct === null ? "—" : fmtPct(pct)}
          </span>
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-[var(--subtle)]">
        <div className={`h-full rounded-full ${barCls}`} style={{ width: `${width}%` }} />
        <div className="absolute top-0 h-full w-px bg-[var(--text-secondary)]" style={{ left: `${(1 / PACE_SCALE) * 100}%` }} />
      </div>
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-3 text-sm font-medium transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]"
    >
      <span className="text-[var(--faint)]">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="py-6 text-center text-sm text-[var(--muted)]">{children}</div>;
}
