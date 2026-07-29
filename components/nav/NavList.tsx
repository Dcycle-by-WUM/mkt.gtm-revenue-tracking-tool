"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { NAV, type NavGroup } from "./items";

// Lista de navegación reutilizable (sidebar de escritorio + drawer móvil).
// Estado activo con barra de acento a la izquierda; grupos colapsables (ABM).
export function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
      {NAV.map((g) => (
        <Group key={g.title} group={g} pathname={pathname} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

function Group({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(!group.defaultCollapsed);
  const hasActive = group.items.some((i) => i.href === pathname);

  return (
    <div>
      {group.collapsible ? (
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)] transition-colors hover:text-[var(--muted)]"
        >
          <span>{group.title}</span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
        </button>
      ) : (
        <div className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--faint)]">
          {group.title}
        </div>
      )}

      {(open || hasActive) && (
        <div className="space-y-0.5">
          {group.items.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  active
                    ? "bg-[var(--accent-soft)] font-medium text-[var(--accent)]"
                    : item.onhold
                      ? "text-[var(--faint)] hover:bg-[var(--subtle)] hover:text-[var(--muted)]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--subtle)] hover:text-[var(--text)]"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[var(--brand)]" />
                )}
                <Icon
                  className={`h-4 w-4 shrink-0 ${active ? "text-[var(--brand)]" : "text-[var(--faint)] group-hover:text-[var(--muted)]"}`}
                  strokeWidth={2}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
