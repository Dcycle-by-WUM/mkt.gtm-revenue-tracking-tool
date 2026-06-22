import { PageHeader, Panel } from "@/components/Page";
import { integrations } from "@/lib/config";
import { getActiveHeatWeights } from "@/lib/data/heat-weights";
import { listTargets } from "@/lib/data/targets";
import { HeatWeightsEditor } from "./admin-client";
import { fmtEur } from "@/lib/kpis";

// Admin / Settings — PRD §9 (13).
function Conn({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] py-2 text-sm last:border-0">
      <div>
        <div>{label}</div>
        <div className="text-xs text-[var(--muted)]">{detail}</div>
      </div>
      <span className={ok ? "text-emerald-300" : "text-amber-300"}>
        {ok ? "Conectado" : "Pendiente"}
      </span>
    </div>
  );
}

export default async function AdminPage() {
  const [weights, targets] = await Promise.all([
    getActiveHeatWeights(),
    listTargets(),
  ]);

  return (
    <div>
      <PageHeader
        title="Admin / Settings"
        subtitle="Conexiones, definiciones de negocio editables, objetivos y usuarios/roles. Acceso abierto mientras el SSO no esté activo."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Conexiones">
          <Conn
            label="Supabase (datos)"
            ok={integrations.supabase}
            detail={
              integrations.supabase
                ? `Proyecto: ${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace("https://", "")}`
                : "Falta NEXT_PUBLIC_SUPABASE_ANON_KEY"
            }
          />
          <Conn
            label="Supabase admin (jobs)"
            ok={integrations.supabaseAdmin}
            detail={
              integrations.supabaseAdmin
                ? "SUPABASE_SERVICE_ROLE_KEY presente"
                : "Falta SUPABASE_SERVICE_ROLE_KEY"
            }
          />
          <Conn
            label="Supermetrics (paid)"
            ok={integrations.supermetrics}
            detail={
              integrations.supermetrics
                ? "Cron sync-paid activo"
                : "Falta SUPERMETRICS_API_KEY"
            }
          />
          <Conn
            label="HubSpot (CRM)"
            ok={integrations.hubspot}
            detail={
              integrations.hubspot
                ? "Cron sync-crm activo"
                : "Pendiente: HUBSPOT_PRIVATE_APP_TOKEN se pone una vez la app esté construida"
            }
          />
          <Conn
            label="Google Workspace SSO"
            ok={integrations.googleSso}
            detail={
              integrations.googleSso
                ? "OAuth client configurado"
                : "Sin SSO todavía → acceso abierto"
            }
          />
        </Panel>

        <Panel title="Usuarios / Roles">
          <p className="mb-2 text-xs text-[var(--muted)]">
            Mientras el SSO no esté activo el acceso es abierto (todos = admin).
            Roles que se aplicarán al entrar:
          </p>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Admin</span><span className="text-[var(--muted)]">acceso total + settings</span></div>
            <div className="flex justify-between"><span>Marketing</span><span className="text-[var(--muted)]">edición forecast/notas/tags</span></div>
            <div className="flex justify-between"><span>SDR</span><span className="text-[var(--muted)]">ABM + sus cuentas</span></div>
            <div className="flex justify-between"><span>Solo lectura</span><span className="text-[var(--muted)]">dashboards</span></div>
          </div>
        </Panel>

        <Panel title="Definiciones de negocio">
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-[var(--muted)]">Regla MQL: </span>
              <code>Lead Status ∉ {`{MK NOT QUALIFIED, vacío}`}</code>
              <div className="text-xs text-[var(--muted)]">(NEW e IN_SEQUENCE sí cuentan — DECISIONES.md #1)</div>
            </div>
            <div>
              <span className="text-[var(--muted)]">País LinkedIn: </span>
              <code>campaignGroupName</code> (regla de oro PRD §8.2)
            </div>
            <div>
              <span className="text-[var(--muted)]">País Google: </span>
              sufijos <code>-es / -de / -fr / -en…</code> + overrides
            </div>
            <div>
              <span className="text-[var(--muted)]">Matching UTM: </span>
              cascada exact → alias → tag manual → fuzzy → cola Data Health
            </div>
          </div>
        </Panel>

        <Panel title="Objetivos activos">
          {targets.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Aún no hay objetivos definidos.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {targets.slice(0, 8).map((t, i) => (
                <li key={`${t.channel}-${t.month}-${t.country}-${i}`} className="flex justify-between border-b border-[var(--border)] py-1 last:border-0">
                  <span>{t.channel} · {t.month} · {t.country}</span>
                  <span className="text-[var(--muted)]">
                    Spend {fmtEur(t.targetSpend)} · Pipeline {fmtEur(t.targetPipeline)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-[var(--muted)]">Edítalos en <a href="/forecast" className="text-[var(--accent)] underline">Pipeline & Forecast</a>.</p>
        </Panel>
      </div>

      <div className="mt-6">
        <HeatWeightsEditor initial={weights} />
      </div>
    </div>
  );
}
