import { PageHeader, Panel } from "@/components/Page";
import { integrations } from "@/lib/config";

// Admin / Settings — Brief §8.13.
function Conn({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--border)] py-2 text-sm last:border-0">
      <span>{label}</span>
      <span className={ok ? "text-emerald-300" : "text-amber-300"}>
        {ok ? "Conectado" : "Pendiente"}
      </span>
    </div>
  );
}

export default function AdminPage() {
  return (
    <div>
      <PageHeader
        title="Admin / Settings"
        subtitle="Usuarios/roles (SSO), conexiones, definiciones de negocio editables y objetivos. (Vista de solo lectura en el preview.)"
        phase="F2"
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Conexiones">
          <Conn label="Supabase (datos + auth)" ok={integrations.supabase} />
          <Conn label="Supermetrics (paid)" ok={integrations.supermetrics} />
          <Conn label="Google Workspace SSO" ok={integrations.googleSso} />
          <Conn label="HubSpot (CRM)" ok={integrations.hubspot} />
        </Panel>

        <Panel title="Usuarios / Roles (SSO Google Workspace)">
          <div className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Admin</span><span className="text-[var(--muted)]">acceso total + settings</span></div>
            <div className="flex justify-between"><span>Marketing</span><span className="text-[var(--muted)]">edición forecast/notas/tags</span></div>
            <div className="flex justify-between"><span>SDR</span><span className="text-[var(--muted)]">ABM + sus cuentas</span></div>
            <div className="flex justify-between"><span>Solo lectura</span><span className="text-[var(--muted)]">dashboards</span></div>
          </div>
        </Panel>

        <Panel title="Definiciones de negocio (editables)">
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-[var(--muted)]">Regla MQL: </span>
              <code>Lead Status ∉ {`{MK NOT QUALIFIED, vacío}`}</code>
            </div>
            <div>
              <span className="text-[var(--muted)]">País LinkedIn: </span>
              por <code>campaignGroupName</code> (regla de oro §7.3)
            </div>
            <div>
              <span className="text-[var(--muted)]">Pesos Heat Score: </span>
              versión §H (configurable)
            </div>
          </div>
        </Panel>

        <Panel title="Mapa de país — overrides">
          <div className="flex flex-wrap gap-2 text-xs">
            {["MEX_ → MX", "US [BOFU] → US", "[UK] → UK", "-ESP → ES", "-de → DE"].map((o) => (
              <span key={o} className="rounded bg-white/5 px-2 py-1 font-mono">{o}</span>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
