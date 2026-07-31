import { PageHeader, Panel } from "@/components/Page";
import { getSourceHealth } from "@/lib/data/source-health";
import { getSdrDiagnostics } from "@/lib/data/sdr-calls";
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
  blocked: "bg-[var(--error-bg)] text-[var(--error-text)]",
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
  const [health, unmatched, campaignOptions, sdrDx] = await Promise.all([
    getSourceHealth(),
    listUnmatchedUtms(),
    listCampaignOptions(),
    getSdrDiagnostics(),
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

      <div className="mt-6">
        <Panel title="SDRs Overview — diagnóstico llamadas/owners">
          {!sdrDx.live ? (
            <p className="text-sm text-[var(--muted)]">Sin Supabase (preview mock).</p>
          ) : sdrDx.error ? (
            <p className="text-sm text-[var(--error-text)]">Error leyendo tablas: {sdrDx.error}</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <DxStat label="Owners en tabla" value={sdrDx.ownersCount} bad={sdrDx.ownersCount === 0} />
                <DxStat label="Llamadas ingeridas" value={sdrDx.callsCount} bad={sdrDx.callsCount === 0} />
                <DxStat label="Sin owner (dialer)" value={sdrDx.callsWithoutOwner} />
                <DxStat
                  label="Owners con nombre / total"
                  value={`${sdrDx.resolvedOwnerIds} / ${sdrDx.distinctOwnerIds}`}
                  bad={sdrDx.distinctOwnerIds > 0 && sdrDx.resolvedOwnerIds === 0}
                />
              </div>
              <p className="mt-3 text-xs text-[var(--muted)]">
                {sdrDx.ownersCount === 0
                  ? "La tabla owners está vacía → los nombres no se pueden resolver. Corre el sync principal (botón \"Actualizar HubSpot\" o cron :00). Si sigue en 0, el token de HubSpot no tiene el scope crm.objects.owners.read."
                  : sdrDx.callsCount === 0
                    ? "Aún no hay llamadas ingeridas — las trae el job sync-calls (:30)."
                    : sdrDx.distinctOwnerIds > 0 && sdrDx.resolvedOwnerIds === 0
                      ? "Hay owners y llamadas, pero ningún owner_id de las llamadas casa con la tabla owners → desajuste de ids (revisar más abajo)."
                      : "Resolución de nombres OK."}
              </p>
              {sdrDx.unresolved.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1 text-xs uppercase tracking-wide text-[var(--muted)]">
                    Owner ids sin nombre (top por nº de llamadas)
                  </div>
                  <ul className="space-y-1 text-xs">
                    {sdrDx.unresolved.map((u) => (
                      <li key={u.ownerId} className="flex justify-between border-b border-[var(--border)] py-1 last:border-0">
                        <span className="font-mono">{u.ownerId}</span>
                        <span className="tabular-nums text-[var(--muted)]">{u.calls} llamadas</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </Panel>
      </div>

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

function DxStat({ label, value, bad }: { label: string; value: string | number; bad?: boolean }) {
  return (
    <div className="card p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${bad ? "text-[var(--error-text)]" : "text-[var(--text)]"}`}>
        {value}
      </div>
    </div>
  );
}
