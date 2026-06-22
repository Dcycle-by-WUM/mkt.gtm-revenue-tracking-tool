import { PageHeader, Panel } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { mockTimeline } from "@/lib/mock-data";

// ABM — Account Timeline — Brief §8.8. Secuencia de eventos por empresa
// (engagements + deals) cruzada con el impacto de paid.
const icon: Record<string, string> = {
  Ad: "📣",
  Descarga: "📄",
  Email: "✉️",
  Web: "🌐",
  Webinar: "🎥",
  Demo: "🤝",
};

export default function AbmTimelinePage() {
  return (
    <div>
      <PageHeader
        title="ABM — Account Timeline"
        subtitle="Secuencia temporal de una cuenta: descargas, visitas, emails, webinar, demo… cruzada con el impacto de paid."
        phase="F4"
      />
      <StatusBanner />
      <Panel title={`Cuenta: ${mockTimeline.account}`}>
        <ol className="relative ml-2 border-l border-[var(--border)]">
          {mockTimeline.events.map((e, i) => (
            <li key={i} className="mb-5 ml-6">
              <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--panel)] text-xs ring-1 ring-[var(--border)]">
                {icon[e.type] ?? "•"}
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
