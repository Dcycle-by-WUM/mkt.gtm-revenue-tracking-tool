import { PageHeader, Panel } from "@/components/Page";
import { getSourceHealth } from "@/lib/data/source-health";
import { listUnmatchedUtms } from "@/lib/matching";
import { listCampaignOptions } from "@/lib/data/campaigns";
import { supabaseLive } from "@/lib/supabase/client";
import { mockUnmatchedUtms, mockMissingCountry } from "@/lib/mock-data";
import { UnmatchedUtmResolver } from "./unmatched-utm-resolver";

export const dynamic = "force-dynamic";

// Data Health — PRD §9 (12). Estado de las fuentes + colas de calidad.
const BADGE: Record<string, string> = {
  ok: "bg-[var(--good-bg)] text-[var(--good-text)]",
  pending: "bg-[var(--warn-bg)] text-[var(--warn-text)]",
  blocked: "bg-red-50 text-red-700",
};
const LABEL: Record<string, string> = {
  ok: "OK",
  pending: "Pendiente",
  blocked: "Bloqueado",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

export default async function DataHealthPage() {
  const [health, unmatched, campaignOptions] = await Promise.all([
    getSourceHealth(),
    listUnmatchedUtms(),
    listCampaignOptions(),
  ]);
  const isLive = supabaseLive();
  const unmatchedList = isLive ? unmatched : mockUnmatchedUtms;

  return (
    <div>
      <PageHeader
        title="Data Health"
        subtitle="Estado de las fuentes de ingesta + frescura del último sync + colas de calidad (UTMs sin match, países por asignar)."
      />

      <Panel title="Fuentes">
        <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-[var(--subtle)] text-left text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">Fuente</th>
                <th className="px-4 py-3">Método</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Último sync</th>
                <th className="px-4 py-3 text-right">Filas</th>
                <th className="px-4 py-3">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {health.map((s) => (
                <tr key={s.source} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3 font-medium">{s.source}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{s.method}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-1 text-xs ${BADGE[s.status]}`}>
                      {LABEL[s.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)] tabular-nums">{fmtDate(s.lastRun)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[var(--muted)]">{s.rows ?? "—"}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{s.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title={`UTMs sin match (${unmatchedList.length})`}>
          {isLive ? (
            <UnmatchedUtmResolver utms={unmatchedList} campaigns={campaignOptions} />
          ) : unmatchedList.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No hay UTMs sin resolver.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {unmatchedList.map((u) => (
                <li key={u} className="flex items-center justify-between border-b border-[var(--border)] py-1.5 last:border-0">
                  <span className="font-mono">{u}</span>
                  <a href="/explorer" className="text-[var(--accent)] underline">Resolver →</a>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-[var(--muted)]">
            Matching en cascada (PRD §8.1): exacto → alias → tag manual → fuzzy.
            Si nada casa, aterriza aquí para resolución humana.
          </p>
        </Panel>

        <Panel title={`Campañas sin país (${mockMissingCountry.length})`}>
          <ul className="space-y-1 text-xs">
            {mockMissingCountry.map((c) => (
              <li key={c} className="flex items-center justify-between border-b border-[var(--border)] py-1.5 last:border-0">
                <span className="font-mono">{c}</span>
                <a href="/explorer" className="text-[var(--accent)] underline">Asignar →</a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[var(--muted)]">
            LinkedIn: por <code>campaignGroupName</code> (Supermetrics) o nombre
            (CSV manual). Google: por sufijo (<code>-es</code>, <code>-de</code>…,
            vía Supermetrics) o nombre (CSV manual, misma heurística que LinkedIn).
            Excepciones via overrides.
          </p>
        </Panel>
      </div>
    </div>
  );
}
