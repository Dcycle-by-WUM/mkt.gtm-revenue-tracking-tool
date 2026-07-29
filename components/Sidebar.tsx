import Link from "next/link";
import { NavList } from "./nav/NavList";

// Sidebar de escritorio (persistente en lg+). En móvil se oculta y la
// navegación se sirve desde el drawer del Topbar. Logo real de dcycle como
// marca unificada — sustituible en /public/brand/dcycle-logo.svg.
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface-sidebar)] lg:flex">
      <div className="px-5 pb-4 pt-6">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/atri-icon.svg" alt="atri" className="h-9 w-9 rounded-xl" />
          <div>
            <div className="text-lg font-bold leading-none tracking-[-0.04em] text-[var(--brand)]">atri</div>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-[var(--faint)]">
              GTM · Revenue
            </div>
          </div>
        </Link>
      </div>

      <NavList />

      <div className="border-t border-[var(--border)] px-5 py-3">
        <div className="flex items-center gap-1.5 text-[11px] text-[var(--faint)]">
          <span>by</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/dcycle-logo.svg" alt="dcycle" className="h-3.5 w-auto opacity-70" />
        </div>
        <div className="mt-2 text-[11px] text-[var(--muted)]">
          Acceso abierto (sin SSO) ·{" "}
          <Link href="/login" className="text-[var(--accent)] hover:underline">
            detalles
          </Link>
        </div>
      </div>
    </aside>
  );
}
