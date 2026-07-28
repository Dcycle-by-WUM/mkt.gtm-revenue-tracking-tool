import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import "./globals.css";

// Inter es la tipografía de la identidad (estilo dcycle/HubSpot). next/font la
// auto-hospeda en el build: sin llamadas a CDN en runtime, funciona offline y
// sin "flash" de fuente. Se expone como var CSS (--font-inter) que consume
// globals.css.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GTM Revenue Tracking — Dcycle",
  description:
    "Unifica paid media (LinkedIn + Google) con resultados de CRM (HubSpot) y orgánico/AEO.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar />
            <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
              <div className="mx-auto max-w-[1400px]">{children}</div>
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}
