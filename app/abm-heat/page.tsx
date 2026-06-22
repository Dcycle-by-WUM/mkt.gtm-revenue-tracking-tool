import { PageHeader } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { mockHeatContacts } from "@/lib/mock-data";
import { computeHeat, isEligible } from "@/lib/heat";

// ABM — Heat Score / Señales de intención — Brief §8.9 / §H.
export default function AbmHeatPage() {
  const ranked = mockHeatContacts
    .map((c) => ({ c, eligible: isEligible(c), heat: computeHeat(c) }))
    .sort((a, b) => b.heat.score - a.heat.score);

  return (
    <div>
      <PageHeader
        title="ABM — Heat Score / Señales de intención"
        subtitle="Ranking pre-demo (señales × recencia, §H). Pesos y umbrales configurables en Admin. 🔥≥70 · ⚡≥50 · 🌱≥30 · ❄️<30."
        phase="F4"
      />
      <StatusBanner />
      <div className="space-y-4">
        {ranked.map(({ c, eligible, heat }) => (
          <div
            key={c.email}
            className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium">
                  {c.company} · <span className="text-[var(--muted)]">{c.jobTitle}</span>
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {c.email} · {c.country} · SDR: {c.ownerSdr}
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
          </div>
        ))}
      </div>
    </div>
  );
}
