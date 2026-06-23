import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "GTM Revenue Tracking — Dcycle",
  description:
    "Unifica paid media (LinkedIn + Google) con resultados de CRM (HubSpot) y orgánico/AEO.",
};

// Navegación = 13 pantallas del PRD §9. ABM (4 pantallas) está en pausa
// hasta nueva orden de negocio — se mantiene accesible pero etiquetado.
const nav: { href: string; label: string; status?: "onhold" }[] = [
  { href: "/", label: "Overview — Cómo vamos" },
  { href: "/paid", label: "Paid Media Performance" },
  { href: "/campaign-detail", label: "Campaign Detail" },
  { href: "/forecast", label: "Pipeline & Forecast" },
  { href: "/explorer", label: "Explorer (pivot)" },
  { href: "/abm-accounts", label: "ABM — Cuentas", status: "onhold" },
  { href: "/abm-timeline", label: "ABM — Account Timeline", status: "onhold" },
  { href: "/abm-heat", label: "ABM — Heat Score", status: "onhold" },
  { href: "/abm-sdr", label: "ABM — por SDR", status: "onhold" },
  { href: "/organic", label: "Orgánico (SEO) + AEO" },
  { href: "/data-health", label: "Data Health" },
  { href: "/admin", label: "Admin / Settings" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          <aside className="w-64 shrink-0 border-r border-[var(--border)] bg-[var(--panel)] p-4">
            <div className="mb-6">
              <div className="text-sm font-semibold tracking-wide text-[var(--accent)]">
                DCYCLE · GTM
              </div>
              <div className="text-xs text-[var(--muted)]">Revenue Tracking</div>
            </div>
            <nav className="space-y-1">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-white/5 ${
                    item.status === "onhold" ? "text-[var(--muted)]" : "text-[var(--text)]"
                  }`}
                >
                  <span>{item.label}</span>
                  {item.status === "onhold" && (
                    <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
                      On hold
                    </span>
                  )}
                </Link>
              ))}
            </nav>

            <div className="mt-8 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] text-amber-200">
              Acceso <strong>abierto</strong> (sin SSO todavía).
              <Link href="/login" className="block underline mt-1">
                Detalles de auth →
              </Link>
            </div>
          </aside>
          <main className="flex-1 p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
