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
  GripVertical,
} from "lucide-react";
import { sumMetrics, groupBy, type CampaignRow, type ForecastRow } from "@/lib/mock-data";
import { fmtEur, fmtNum, fmtPct, roi, cpl, cpmql } from "@/lib/kpis";
import { leadCohort, dealState, type DealRow, type LeadCohort } from "@/lib/data/deals";
import { Tooltip } from "@/components/ui/Tooltip";
import { Donut } from "@/components/ui/charts";

// Color de marca por canal (paleta dataviz), coherente con la pantalla Métricas.
const CH_COLOR: Record<string, string> = {
  LinkedIn: "var(--chart-1)",
  Google: "var(--chart-2)",
  Organic: "var(--chart-4)",
  "Email Marketing": "var(--chart-5)",
  Otros: "var(--chart-6)",
};

// Orígenes del dato — reutilizados en tooltips (coherentes con Data Health).
const SRC = {
  spend: "Coste real de paid media (LinkedIn Ads + Google Ads) vía Supermetrics.",
  funnel: "Del CRM (HubSpot): contactos y su etapa de ciclo de vida (Lead → MQL → SQL).",
  pipeline: "Suma del importe de deals atribuidos, de HubSpot. Atribución paid↔CRM por utm_campaign.",
};

const LS_KEY = "gtm-dashboard-modules-v1";

// Vista/scope del dashboard. "h2" es el default de Dcycle (ver más abajo).
type Scope = "h2" | "month" | "ytd";

// ── Definición de H2 (Dcycle) ──────────────────────────────────────────────
// El semestre H2 combina DOS ventanas distintas según la métrica:
//   • Pipeline € e inversión (paid) → lo GENERADO a partir del 1 jun 2026.
//   • Deals de inbound CERRADOS      → a partir del 1 ago 2026.
// Por eso hay dos cortes de mes (YYYY-MM) y no una sola fecha de inicio.
const H2_PIPELINE_START = "2026-06"; // pipeline + inversión "generados"
const H2_DEALS_START = "2026-08"; //    deals de inbound "cerrados"

// Notas que se añaden a la INFO (tooltip) de cada punto cuando la vista es H2,
// para que la definición del semestre quede explicada en su propio contexto.
const H2_NOTE = {
  spend: "H2 Dcycle: incluye la inversión generada a partir del 1 jun 2026.",
  pipeline: "H2 Dcycle: incluye el pipeline generado a partir del 1 jun 2026.",
  roi: "Pipeline € generado por cada € invertido. En H2, sobre lo generado desde el 1 jun 2026.",
  closedWon: "H2 Dcycle: deals de inbound cerrados a partir del 1 ago 2026.",
  funnel: "H2 Dcycle: volumen del embudo generado a partir del 1 jun 2026.",
};

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
  deals = [],
}: {
  campaigns: CampaignRow[];
  targets: ForecastRow[];
  deals?: DealRow[];
}) {
  // Default = H2 (semestre Dcycle). El equipo mira el dashboard en clave de H2,
  // así que arranca ahí; "Este mes" y "Año (YTD)" siguen a un clic.
  const [scope, setScope] = useState<Scope>("h2");

  // Layout personalizable persistido en localStorage (por navegador).
  const [order, setOrder] = useState<string[]>(DEFAULT_ORDER);
  const [hydrated, setHydrated] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
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
  // Scope de campañas/objetivos (spend, pipeline, embudo, canales, targets).
  // En H2 = todo lo generado desde jun 2026 (H2_PIPELINE_START).
  const inScope = (m: string) =>
    scope === "month" ? m === activeMonth : scope === "ytd" ? m.startsWith(year) : m >= H2_PIPELINE_START;
  // Scope de DEALS (cohorte/estado/closed won). En H2 = deals de inbound
  // cerrados desde ago 2026 (H2_DEALS_START), ventana distinta a la de pipeline.
  const dealInScope = (m: string | null | undefined) =>
    scope === "month"
      ? m === activeMonth
      : scope === "ytd"
        ? !!m?.startsWith(year)
        : !!m && m >= H2_DEALS_START;

  const rows = useMemo(() => campaigns.filter((c) => inScope(c.month)), [campaigns, scope, activeMonth]);
  const t = useMemo(() => sumMetrics(rows), [rows]);

  const targetRows = useMemo(() => targets.filter((r) => inScope(r.month)), [targets, scope, activeMonth]);
  const targetPipeline = targetRows.reduce((s, r) => s + r.targetPipeline, 0);
  const targetSpend = targetRows.reduce((s, r) => s + r.targetSpend, 0);

  // Closed Won del semestre H2: deals de inbound (deal_attribution ya viene
  // scoped a inbound) cerrados ganados a partir del 1 ago 2026. En las demás
  // vistas seguimos usando el closedWon agregado de campañas (t.closedWon).
  const closedWonH2 = useMemo(
    () => deals.filter((d) => d.isClosedWon && d.month >= H2_DEALS_START).reduce((s, d) => s + d.amount, 0),
    [deals],
  );
  const closedWon = scope === "h2" ? closedWonH2 : t.closedWon;

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

  // Cross-section: pipeline de deals por cohorte del lead (de Deals & Atribución).
  const dealsByCohort = useMemo(() => {
    const inYear = deals.filter((d) => dealInScope(d.month));
    const labels: Record<LeadCohort, string> = { "2026": "Leads 2026", "histórico": "Leads históricos", "sin contacto": "Sin contacto" };
    return (Object.keys(labels) as LeadCohort[]).map((c) => ({
      name: labels[c],
      amount: inYear.filter((d) => leadCohort(d) === c).reduce((s, d) => s + d.amount, 0),
      count: inYear.filter((d) => leadCohort(d) === c).length,
    }));
  }, [deals, scope, activeMonth, year]);
  const maxCohort = Math.max(1, ...dealsByCohort.map((c) => c.amount));

  // Cross-section: Spend por canal (de Métricas), para la dona.
  const spendByChannel = useMemo(
    () =>
      byChannel
        .filter((c) => c.m.spend > 0)
        .map((c) => ({ label: c.name, value: c.m.spend, color: CH_COLOR[c.name] ?? "var(--chart-3)" })),
    [byChannel],
  );

  // Cross-section: reparto de deals por estado (de Deals & Atribución).
  const dealsByState = useMemo(() => {
    const inScopeDeals = deals.filter((d) => dealInScope(d.month));
    const defs: { key: "abierto" | "ganado" | "cerrado"; label: string; color: string }[] = [
      { key: "abierto", label: "Abiertos", color: "var(--chart-1)" },
      { key: "ganado", label: "Ganados", color: "var(--chart-4)" },
      { key: "cerrado", label: "Perdidos", color: "var(--chart-6)" },
    ];
    return defs
      .map((d) => ({ label: d.label, color: d.color, value: inScopeDeals.filter((x) => dealState(x) === d.key).reduce((s, x) => s + x.amount, 0) }))
      .filter((d) => d.value > 0);
  }, [deals, scope, activeMonth, year]);

  const scopeLabel = scope === "month" ? `mes ${activeMonth}` : scope === "ytd" ? `año ${year} (YTD)` : "H2 2026";

  // Ayuda de tooltip que, en vista H2, añade la definición del semestre bajo el
  // texto de origen del dato — así la INFO de cada punto explica el H2.
  const withH2 = (base: React.ReactNode, note: string): React.ReactNode =>
    scope === "h2" ? (
      <>
        {base}
        <span className="mt-1.5 block border-t border-[var(--border)] pt-1.5 text-[var(--muted)]">{note}</span>
      </>
    ) : (
      base
    );

  // Registro de módulos: cada uno con título, ancho (col-span en lg) y contenido.
  const MODULES: Record<string, { title: string; span: number; node: React.ReactNode }> = {
    kpis: {
      title: "Indicadores",
      span: 3,
      node: (
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
          <KpiCell label="Inversión" value={fmtEur(t.spend)} help={withH2(SRC.spend, H2_NOTE.spend)} icon={<Wallet className="h-5 w-5" />}
            sub={targetSpend > 0 ? `Objetivo ${fmtEur(targetSpend)}` : undefined}
            delta={targetSpend > 0 ? { pace: spendPace!, positiveIsGood: false } : undefined} />
          <KpiCell label="Pipeline generado" value={fmtEur(t.pipeline)} help={withH2(SRC.pipeline, H2_NOTE.pipeline)} icon={<TrendingUp className="h-5 w-5" />}
            sub={targetPipeline > 0 ? `Objetivo ${fmtEur(targetPipeline)}` : undefined}
            delta={targetPipeline > 0 ? { pace: pipelinePace!, positiveIsGood: true } : undefined} />
          <KpiCell label="ROI" value={fmtPct(roi(t))} help={withH2("Pipeline € generado por cada € invertido (pipeline ÷ inversión).", H2_NOTE.roi)} icon={<Target className="h-5 w-5" />} sub="Pipeline € por € invertido" />
          <KpiCell label="Closed Won" value={fmtEur(closedWon)} help={withH2("Importe de deals ganados atribuidos, de HubSpot.", H2_NOTE.closedWon)} icon={<Trophy className="h-5 w-5" />}
            sub={scope === "h2" ? "Inbound cerrado · desde ago 2026" : "Deals ganados"} />
        </div>
      ),
    },
    funnel: {
      title: `Embudo · ${scopeLabel}`,
      span: 2,
      node: <FunnelBar t={t} help={withH2(SRC.funnel, H2_NOTE.funnel)} />,
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
    dealsCohort: {
      title: "Pipeline de deals por cohorte",
      span: 2,
      node: (
        <div className="space-y-3">
          {dealsByCohort.map((c) => (
            <div key={c.name}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">{c.name}</span>
                <span className="tabular-nums text-[var(--muted)]">
                  {fmtEur(c.amount)} · {c.count} deals
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--subtle)]">
                <div className="h-full rounded-full bg-[var(--chart-4)]" style={{ width: `${(c.amount / maxCohort) * 100}%` }} />
              </div>
            </div>
          ))}
          <Link href="/deals" className="inline-block pt-1 text-xs text-[var(--accent)] hover:underline">
            Ver Deals & Atribución →
          </Link>
        </div>
      ),
    },
    spendChannel: {
      title: "Spend por canal",
      span: 1,
      node:
        spendByChannel.length > 0 ? (
          <Donut data={spendByChannel} size={140} formatValue={(v) => fmtEur(v)} />
        ) : (
          <Empty>Sin gasto en {scopeLabel}.</Empty>
        ),
    },
    dealsState: {
      title: "Deals por estado",
      span: 1,
      node:
        dealsByState.length > 0 ? (
          <Donut data={dealsByState} size={140} formatValue={(v) => fmtEur(v)} />
        ) : (
          <Empty>Sin deals en {scopeLabel}.</Empty>
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

  // Drag & drop nativo (sin dependencias): reordena la lista de módulos visibles.
  const onDropOn = (overId: string) => {
    if (!dragId || dragId === overId) return setDragId(null);
    const next = [...visible];
    const from = next.indexOf(dragId);
    const to = next.indexOf(overId);
    if (from < 0 || to < 0) return setDragId(null);
    next.splice(from, 1);
    next.splice(to, 0, dragId);
    persist(next);
    setDragId(null);
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-fit items-center gap-1 rounded-lg bg-[var(--subtle)] p-1">
          <ScopeTab label="H2 2026" active={scope === "h2"} onClick={() => setScope("h2")} />
          <ScopeTab label="Este mes" active={scope === "month"} onClick={() => setScope("month")} />
          <ScopeTab label="Año (YTD)" active={scope === "ytd"} onClick={() => setScope("ytd")} />
        </div>
        {hydrated && <AddModuleMenu hidden={hidden} modules={MODULES} onAdd={add} onReset={reset} />}
      </div>

      {scope === "h2" && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--brand-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--text-secondary)]">
          <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--brand)]" />
          <span>
            <strong className="text-[var(--text)]">Semestre H2 2026 (vs objetivo).</strong>{" "}
            Pipeline € e inversión = lo generado desde el <strong>1 jun 2026</strong>; deals de inbound
            cerrados = desde el <strong>1 ago 2026</strong>. La barra de cada objetivo marca el ritmo vs target.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {visible.map((id, i) => {
          const mod = MODULES[id];
          const spanCls = mod.span === 3 ? "lg:col-span-3" : mod.span === 2 ? "lg:col-span-2" : "lg:col-span-1";
          return (
            <div
              key={id}
              className={`${spanCls} ${dragId && dragId !== id ? "transition-transform" : ""}`}
              onDragOver={(e) => { if (dragId) e.preventDefault(); }}
              onDrop={() => onDropOn(id)}
            >
              <ModuleCard
                title={mod.title}
                dragging={dragId === id}
                dimmed={!!dragId && dragId !== id}
                canUp={i > 0}
                canDown={i < visible.length - 1}
                onUp={() => move(id, -1)}
                onDown={() => move(id, 1)}
                onRemove={() => remove(id)}
                onDragStart={() => setDragId(id)}
                onDragEnd={() => setDragId(null)}
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

// ── Wrapper de módulo: handle de arrastre + menú ⋯ ─────────────────────────
function ModuleCard({
  title,
  children,
  canUp,
  canDown,
  onUp,
  onDown,
  onRemove,
  dragging,
  dimmed,
  onDragStart,
  onDragEnd,
}: {
  title: string;
  children: React.ReactNode;
  canUp: boolean;
  canDown: boolean;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  dragging?: boolean;
  dimmed?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`card flex h-full flex-col p-5 transition-all ${
        dragging ? "scale-[0.99] opacity-50 ring-2 ring-[var(--brand)]" : dimmed ? "opacity-90" : ""
      }`}
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="cursor-grab text-[var(--faint)] transition-colors hover:text-[var(--muted)] active:cursor-grabbing"
            title="Arrastra para reordenar"
            aria-hidden
          >
            <GripVertical className="h-4 w-4" />
          </span>
          <h3 className="truncate text-sm font-semibold">{title}</h3>
        </div>
        <div className="relative shrink-0">
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
  sub,
  icon,
  delta,
}: {
  label: string;
  value: React.ReactNode;
  help?: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  delta?: { pace: number; positiveIsGood: boolean };
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[var(--brand)]">
            {icon}
          </span>
        )}
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</span>
        {help && <Tooltip content={help} />}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-semibold leading-none tabular-nums">{value}</span>
        {delta && <DeltaChip pace={delta.pace} positiveIsGood={delta.positiveIsGood} />}
      </div>
      {sub && <div className="mt-1.5 text-xs text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

// Chip de tendencia vs objetivo: ▲/▼ + desvío (p. ej. +6,6% / −1,9%), en verde
// si el ritmo es bueno, ámbar si roza, rojo si se desvía mucho. `positiveIsGood`
// distingue pipeline (más = mejor) de inversión (pasarse = malo).
function DeltaChip({ pace, positiveIsGood }: { pace: number; positiveIsGood: boolean }) {
  const diff = pace - 1;
  const above = pace >= 1;
  const tone = positiveIsGood
    ? pace >= 0.95 ? "good" : pace >= 0.7 ? "warn" : "error"
    : pace <= 1 ? "good" : pace <= 1.1 ? "warn" : "error";
  const cls = {
    good: "bg-[var(--good-bg)] text-[var(--good-text)]",
    warn: "bg-[var(--warn-bg)] text-[var(--warn-text)]",
    error: "bg-[var(--error-bg)] text-[var(--error-text)]",
  }[tone];
  const sign = diff >= 0 ? "+" : "−";
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums ${cls}`}>
      {above ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {sign}{fmtPct(Math.abs(diff))}
    </span>
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

function FunnelBar({ t, help }: { t: ReturnType<typeof sumMetrics>; help: React.ReactNode }) {
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
