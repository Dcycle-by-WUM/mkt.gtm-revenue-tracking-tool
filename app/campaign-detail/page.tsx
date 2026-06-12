import { PageHeader, Panel } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { mockCampaigns, mockSpendTimeline } from "@/lib/mock-data";
import { fmtEur, fmtNum, fmtPct, cpl, roi } from "@/lib/kpis";

// Campaign Detail — Brief §8.4.
export default function CampaignDetailPage() {
  const c = mockCampaigns[0]; // esp_mensaje_españa_documento [mofu]
  const maxSpend = Math.max(...mockSpendTimeline.map((d) => d.spend));

  const funnel = [
    { stage: "Leads", value: c.leads, money: false },
    { stage: "MQL", value: c.mql, money: false },
    { stage: "SQL", value: c.sql, money: false },
    { stage: "Pipeline €", value: c.pipeline, money: true },
    { stage: "Closed Won", value: c.closedWon, money: true },
  ];

  return (
    <div>
      <PageHeader
        title="Campaign Detail"
        subtitle="Spend timeline, embudo Lead→MQL→SQL→Pipeline→Won, estado de matching UTM, grupo/país y notas."
        phase="F2"
      />
      <StatusBanner />

      <Panel>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
          <div>
            <span className="text-[var(--muted)]">Campaña: </span>
            <span className="font-mono">{c.campaign}</span>
          </div>
          <div>
            <span className="text-[var(--muted)]">Canal: </span>
            {c.channel}
          </div>
          <div>
            <span className="text-[var(--muted)]">Grupo: </span>
            {c.campaignGroup ?? "—"}
          </div>
          <div>
            <span className="text-[var(--muted)]">País (por grupo): </span>
            {c.country}
          </div>
          <span className="rounded bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300">
            UTM matcheado (exacto)
          </span>
        </div>
      </Panel>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Spend timeline (semanal)">
          <div className="flex h-40 items-end gap-2">
            {mockSpendTimeline.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-[var(--accent)]/70"
                  style={{ height: `${(d.spend / maxSpend) * 100}%` }}
                  title={fmtEur(d.spend)}
                />
                <span className="text-[10px] text-[var(--muted)]">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Embudo">
          <div className="space-y-2">
            {funnel.map((f) => (
              <div key={f.stage} className="flex items-center gap-3">
                <div className="w-24 text-sm text-[var(--muted)]">{f.stage}</div>
                <div className="h-6 flex-1 rounded bg-white/5">
                  <div
                    className="h-6 rounded bg-[var(--accent)]/60"
                    style={{
                      width: `${Math.max((f.money ? f.value / c.pipeline : f.value / c.leads) * 100, 4)}%`,
                    }}
                  />
                </div>
                <div className="w-24 text-right text-sm tabular-nums">
                  {f.money ? fmtEur(f.value) : fmtNum(f.value)}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-6 border-t border-[var(--border)] pt-3 text-sm">
            <div>
              <span className="text-[var(--muted)]">CPL: </span>
              {fmtEur(cpl(c))}
            </div>
            <div>
              <span className="text-[var(--muted)]">ROI: </span>
              {fmtPct(roi(c))}
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-6">
        <Panel title="Notas">
          <p className="text-sm text-[var(--muted)]">
            (Editable en producción) — p.ej. &quot;Subir presupuesto en semana de
            webinar; revisar creatividades MOFU&quot;.
          </p>
        </Panel>
      </div>
    </div>
  );
}
