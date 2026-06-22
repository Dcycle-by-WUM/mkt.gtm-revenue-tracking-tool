import { mockSourceHealth } from "@/lib/mock-data";

// Data Health — Brief §8.12. Frescura/estado de cada fuente de ingesta.
const badge: Record<string, string> = {
  ok: "bg-emerald-500/15 text-emerald-300",
  pending: "bg-amber-500/15 text-amber-300",
  blocked: "bg-red-500/15 text-red-300",
};

const label: Record<string, string> = {
  ok: "OK",
  pending: "Pendiente",
  blocked: "Bloqueado",
};

export default function DataHealthPage() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Data Health</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">
        Estado de las fuentes de datos e ingesta. Colas de matching/país llegan
        con la ingesta real (F1).
      </p>
      <div className="overflow-hidden rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--panel)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Fuente</th>
              <th className="px-4 py-3">Método</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {mockSourceHealth.map((s) => (
              <tr key={s.source} className="border-t border-[var(--border)]">
                <td className="px-4 py-3 font-medium">{s.source}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{s.method}</td>
                <td className="px-4 py-3">
                  <span className={`rounded px-2 py-1 text-xs ${badge[s.status]}`}>
                    {label[s.status]}
                  </span>
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">{s.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
