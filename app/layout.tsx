import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "GTM Revenue Tracking — Dcycle",
  description:
    "Unifica paid media (LinkedIn + Google) con resultados de CRM (HubSpot) y orgánico/AEO.",
};

// Navegación = pantallas del brief §8. Las marcadas como `phase` aún no están
// implementadas (stubs) para que Ops vea el alcance completo de la herramienta.
const nav: { href: string; label: string; phase?: string }[] = [
  { href: "/", label: "Overview — Cómo vamos" },
  { href: "/paid", label: "Paid Media Performance" },
  { href: "/data-health", label: "Data Health" },
  { href: "/campaign-detail", label: "Campaign Detail", phase: "F2" },
  { href: "/forecast", label: "Pipeline & Forecast", phase: "F3" },
  { href: "/explorer", label: "Explorer (pivot)", phase: "F2" },
  { href: "/abm-accounts", label: "ABM — Cuentas", phase: "F4" },
  { href: "/abm-heat", label: "ABM — Heat Score", phase: "F4" },
  { href: "/organic", label: "Orgánico (SEO) + AEO", phase: "F5" },
  { href: "/admin", label: "Admin / Settings", phase: "F2" },
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
                  className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-[var(--text)] hover:bg-white/5"
                >
                  <span>{item.label}</span>
                  {item.phase && (
                    <span className="ml-2 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                      {item.phase}
                    </span>
                  )}
                </Link>
              ))}
            </nav>
          </aside>
          <main className="flex-1 p-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
