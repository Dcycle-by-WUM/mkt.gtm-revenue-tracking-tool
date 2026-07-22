"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Navegación agrupada por intención (rediseño jul-2026): menos ruido que la
// lista plana de 13 entradas. ABM va colapsado al final porque está on hold.
type NavItem = { href: string; label: string; onhold?: boolean };
type NavGroup = { title: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    title: "Rendimiento",
    items: [
      { href: "/", label: "Overview" },
      { href: "/metrics", label: "Métricas Canal/País" },
      { href: "/paid", label: "Detalle por Campaña/Canal" },
      { href: "/deals", label: "Deals & Atribución" },
      { href: "/organic", label: "Orgánico + AEO" },
    ],
  },
  {
    title: "Planificación",
    items: [
      { href: "/forecast", label: "Forecast & Objetivos" },
      { href: "/explorer", label: "Explorer (pivot)" },
    ],
  },
  {
    title: "ABM · on hold",
    items: [
      { href: "/abm-accounts", label: "Cuentas", onhold: true },
      { href: "/abm-timeline", label: "Timeline", onhold: true },
      { href: "/abm-heat", label: "Heat Score", onhold: true },
      { href: "/abm-sdr", label: "Por SDR", onhold: true },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/data-health", label: "Data Health" },
      { href: "/admin", label: "Admin" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--panel)]">
      <div className="px-5 pb-4 pt-6">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)] text-xs font-bold text-white">
            D
          </span>
          <div>
            <div className="text-sm font-semibold leading-tight">Dcycle GTM</div>
            <div className="text-[11px] text-[var(--muted)]">Revenue Tracking</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
              {g.title}
            </div>
            <div className="space-y-0.5">
              {g.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                        : item.onhold
                          ? "text-[var(--muted)] hover:bg-[var(--subtle)]"
                          : "text-[var(--text)] hover:bg-[var(--subtle)]"
                    }`}
                  >
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--border)] px-5 py-3 text-[11px] text-[var(--muted)]">
        Acceso abierto (sin SSO) ·{" "}
        <Link href="/login" className="underline">
          detalles
        </Link>
      </div>
    </aside>
  );
}
