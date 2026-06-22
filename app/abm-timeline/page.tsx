import { PageHeader, Panel } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { getAccountTimeline } from "@/lib/data/timeline";
import { listAccounts } from "@/lib/data/accounts";
import { TimelineSelector } from "./timeline-selector";

// ABM — Account Timeline — PRD §9 (8).
const ICON: Record<string, string> = {
  Ad: "📣",
  Descarga: "📄",
  Email: "✉️",
  Web: "🌐",
  Webinar: "🎥",
  Demo: "🤝",
  meeting: "🤝",
  call: "📞",
  note: "📝",
};

export default async function AbmTimelinePage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const sp = await searchParams;
  const accounts = await listAccounts();
  const selected = sp.account || accounts[0]?.name || "Acme Logistics";
  const timeline = await getAccountTimeline(selected);

  return (
    <div>
      <PageHeader
        title="ABM — Account Timeline"
        subtitle="Secuencia temporal por cuenta: descargas, visitas, emails, webinar, demo… cruzada con el impacto de paid."
      />
      <StatusBanner />

      <TimelineSelector accounts={accounts.map((a) => a.name)} current={selected} />

      <Panel title={`Cuenta: ${timeline.account}`}>
        <ol className="relative ml-2 border-l border-[var(--border)]">
          {timeline.events.map((e, i) => (
            <li key={i} className="mb-5 ml-6">
              <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--panel)] text-xs ring-1 ring-[var(--border)]">
                {ICON[e.type] ?? "•"}
              </span>
              <div className="text-xs text-[var(--muted)]">{e.date}</div>
              <div className="text-sm">
                <span className="font-medium">{e.type}</span> — {e.detail}
              </div>
            </li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
