import { PageHeader, OnHoldBanner } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { listHeatRanking } from "@/lib/data/contacts";

export const dynamic = "force-dynamic";

// ABM — Heat Score — PRD §9 (9).
export default async function AbmHeatPage() {
  const ranked = await listHeatRanking();
  return (
    <div>
      <PageHeader
        title="ABM — Heat Score / Señales de intención"
        subtitle="Ranking pre-demo (señales × recencia, §10). Pesos y umbrales configurables en Admin. 🔥≥70 · ⚡≥50 · 🌱≥30 · ❄️<30."
      />
      <OnHoldBanner area="ABM" />
      <StatusBanner />
      <div className="space-y-4">
        {ranked.map(({ contact, eligible, heat }) => (
          <div
            key={contact.email || `${contact.company}-${contact.jobTitle}`}
            className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium">
                  {contact.company} · <span className="text-[var(--muted)]">{contact.jobTitle}</span>
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {contact.email} · {contact.country} · SDR: {contact.ownerSdr}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {!eligible && (
                  <span className="rounded bg-white/10 px-2 py-1 text-xs text-[var(--muted)]">
                    no elegible
                  </span>
                )}
                <div className="text-right">
                  <div className="text-2xl font-semibold tabular-nums">{heat.score}</div>
                  <div className="text-sm">{heat.band}</div>
                </div>
              </div>
            </div>
            {heat.breakdown.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
                {heat.breakdown.map((b) => (
                  <span
                    key={b.signal}
                    className="rounded bg-white/5 px-2 py-1 text-xs text-[var(--muted)]"
                  >
                    {b.signal}: <span className="text-[var(--text)]">+{b.points}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
