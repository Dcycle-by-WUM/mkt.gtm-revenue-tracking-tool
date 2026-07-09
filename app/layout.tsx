import type { Metadata } from "next";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

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
    <html lang="es">
      <body className="min-h-screen">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="min-w-0 flex-1 px-8 py-7">
            <div className="mx-auto max-w-[1400px]">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
