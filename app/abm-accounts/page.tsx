import { PageHeader } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { mockAccounts, mockHeatContacts } from "@/lib/mock-data";
import { computeHeat } from "@/lib/heat";

// ABM — Cuentas — Brief §8.7. Heat Score de la cuenta = máximo de sus contactos.
function accountHeat(company: string) {
  const contacts = mockHeatContacts.filter((c) => c.company === company);
  if (contacts.length === 0) return null;
  return contacts
    .map(computeHeat)
    .reduce((best, r) => (r.score > best.score ? r : best));
}

export default function AbmAccountsPage() {
  return (
    <div>
      <PageHeader
        title="ABM — Cuentas"
        subtitle="Cuentas-objetivo: estado, Heat Score, última actividad, SDR y si han sido impactadas por ads. Ordenable por score."
        phase="F4"
      />
      <StatusBanner />
      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--panel)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Cuenta</th>
              <th className="px-4 py-3">País</th>
              <th className="px-4 py-3">SDR</th>
              <th className="px-4 py-3">ABM</th>
              <th className="px-4 py-3">Heat Score</th>
              <th className="px-4 py-3">Última actividad</th>
              <th className="px-4 py-3">Impactada por ads</th>
            </tr>
          </thead>
          <tbody>
            {mockAccounts.map((a) => {
              const heat = accountHeat(a.name);
              return (
                <tr key={a.domain} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-[var(--muted)]">{a.domain}</div>
                  </td>
                  <td className="px-4 py-3">{a.country}</td>
                  <td className="px-4 py-3">{a.sdr}</td>
                  <td className="px-4 py-3">{a.isTargetAbm ? "🎯 Sí" : "—"}</td>
                  <td className="px-4 py-3">
                    {heat ? (
                      <span className="tabular-nums">
                        {heat.score} · {heat.band}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">{a.lastActivity}</td>
                  <td className="px-4 py-3">{a.impactedByAds ? "✅" : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
