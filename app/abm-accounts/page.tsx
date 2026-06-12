"use client";

import { useState } from "react";
import { PageHeader } from "@/components/Page";
import { StatusBanner } from "@/components/StatusBanner";
import { mockAccounts, mockHeatContacts, SDRS, type AbmAccount } from "@/lib/mock-data";
import { computeHeat } from "@/lib/heat";
import { useLocalState } from "@/lib/store";

// ABM — Cuentas — Brief §8.7. Filtros + edición (objetivo ABM, SDR, notas).
function accountHeat(company: string) {
  const cs = mockHeatContacts.filter((c) => c.company === company);
  if (cs.length === 0) return null;
  return cs.map(computeHeat).reduce((best, r) => (r.score > best.score ? r : best));
}

export default function AbmAccountsPage() {
  const [accounts, setAccounts] = useLocalState<AbmAccount[]>("gtm.accounts.v1", mockAccounts);
  const [notes, setNotes] = useLocalState<Record<string, string>>("gtm.accountNotes.v1", {});
  const [country, setCountry] = useState("");
  const [sdr, setSdr] = useState("");

  const countries = [...new Set(accounts.map((a) => a.country))].sort();
  const visible = accounts
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => (!country || a.country === country) && (!sdr || a.sdr === sdr));

  const update = (i: number, patch: Partial<AbmAccount>) =>
    setAccounts(accounts.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

  const sel = "rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm";

  return (
    <div>
      <PageHeader
        title="ABM — Cuentas"
        subtitle="Cuentas-objetivo con Heat Score, SDR e impacto de ads. Filtra y edita objetivo ABM, SDR y notas (se guardan)."
        phase="F4"
      />
      <StatusBanner />

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-[var(--muted)]">Filtros</span>
        <select className={sel} value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">Todos los países</option>
          {countries.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className={sel} value={sdr} onChange={(e) => setSdr(e.target.value)}>
          <option value="">Todos los SDR</option>
          {SDRS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--panel)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Cuenta</th>
              <th className="px-4 py-3">País</th>
              <th className="px-4 py-3">SDR</th>
              <th className="px-4 py-3">ABM</th>
              <th className="px-4 py-3">Heat Score</th>
              <th className="px-4 py-3">Ads</th>
              <th className="px-4 py-3">Nota</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ a, i }) => {
              const heat = accountHeat(a.name);
              return (
                <tr key={a.domain} className="border-t border-[var(--border)]">
                  <td className="px-4 py-3">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-[var(--muted)]">{a.domain}</div>
                  </td>
                  <td className="px-4 py-3">{a.country}</td>
                  <td className="px-4 py-2">
                    <select className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs" value={a.sdr} onChange={(e) => update(i, { sdr: e.target.value })}>
                      {SDRS.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={a.isTargetAbm} onChange={(e) => update(i, { isTargetAbm: e.target.checked })} />
                  </td>
                  <td className="px-4 py-3 tabular-nums">{heat ? `${heat.score} · ${heat.band}` : "—"}</td>
                  <td className="px-4 py-3">{a.impactedByAds ? "✅" : "—"}</td>
                  <td className="px-4 py-2">
                    <input
                      value={notes[a.domain] ?? ""}
                      onChange={(e) => setNotes({ ...notes, [a.domain]: e.target.value })}
                      placeholder="Apunte…"
                      className="w-44 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[var(--muted)]">
        Cambios guardados en tu navegador (en producción, en Supabase con auditoría).
      </p>
    </div>
  );
}
