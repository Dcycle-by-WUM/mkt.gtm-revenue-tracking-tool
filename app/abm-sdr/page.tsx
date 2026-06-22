import { PageHeader, Panel } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { mockAccounts, mockHeatContacts } from "@/lib/mock-data";
import { computeHeat } from "@/lib/heat";

// ABM — Overview por SDR — Brief §8.10. Cada SDR vs sus cuentas (Contact owner).
export default function AbmSdrPage() {
  const sdrs = [...new Set(mockAccounts.map((a) => a.sdr))];

  return (
    <div>
      <PageHeader
        title="ABM — Overview por SDR"
        subtitle="Cada SDR frente a sus cuentas asignadas (Contact owner): estado, última actividad y leads calientes."
        phase="F4"
      />
      <StatusBanner />
      <div className="grid gap-6 lg:grid-cols-2">
        {sdrs.map((sdr) => {
          const accounts = mockAccounts.filter((a) => a.sdr === sdr);
          const hot = mockHeatContacts
            .filter((c) => c.ownerSdr === sdr)
            .map(computeHeat)
            .filter((h) => h.band === "🔥 Caliente").length;
          return (
            <Panel key={sdr} title={`SDR · ${sdr}`}>
              <div className="mb-3 flex gap-6 text-sm">
                <div>
                  <span className="text-[var(--muted)]">Cuentas: </span>
                  {accounts.length}
                </div>
                <div>
                  <span className="text-[var(--muted)]">Leads 🔥: </span>
                  {hot}
                </div>
              </div>
              <ul className="space-y-1 text-sm">
                {accounts.map((a) => (
                  <li key={a.domain} className="flex justify-between">
                    <span>{a.name}</span>
                    <span className="text-[var(--muted)]">{a.lastActivity}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
