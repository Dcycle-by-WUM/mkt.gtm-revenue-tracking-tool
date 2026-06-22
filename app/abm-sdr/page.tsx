import { PageHeader, Panel } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { listAccounts } from "@/lib/data/accounts";
import { listHeatRanking } from "@/lib/data/contacts";

export const dynamic = "force-dynamic";

// ABM — Overview por SDR — PRD §9 (10). Cada SDR vs sus cuentas (`Contact owner`).
export default async function AbmSdrPage() {
  const [accounts, heat] = await Promise.all([listAccounts(), listHeatRanking()]);
  const sdrs = [...new Set(accounts.map((a) => a.sdr))];

  return (
    <div>
      <PageHeader
        title="ABM — Overview por SDR"
        subtitle="Cada SDR frente a sus cuentas asignadas (Contact owner): estado, última actividad y leads calientes."
      />
      <StatusBanner />
      <div className="grid gap-6 lg:grid-cols-2">
        {sdrs.map((sdr) => {
          const accs = accounts.filter((a) => a.sdr === sdr);
          const hot = heat.filter((h) => h.contact.ownerSdr === sdr && h.heat.band === "🔥 Caliente").length;
          return (
            <Panel key={sdr} title={`SDR · ${sdr}`}>
              <div className="mb-3 flex gap-6 text-sm">
                <div><span className="text-[var(--muted)]">Cuentas: </span>{accs.length}</div>
                <div><span className="text-[var(--muted)]">Leads 🔥: </span>{hot}</div>
              </div>
              <ul className="space-y-1 text-sm">
                {accs.map((a) => (
                  <li key={a.domain || a.name} className="flex justify-between">
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
