"use client";

import { useState, useTransition } from "react";
import { SDRS } from "@/lib/mock-data";
import type { AbmAccountLive } from "@/lib/data/accounts";
import { actionUpdateAccount, actionUpsertNote } from "@/app/actions";

export function AccountsClient({
  initial,
  notes: initialNotes,
}: {
  initial: AbmAccountLive[];
  notes: Record<string, string>;
}) {
  const [accounts, setAccounts] = useState(initial);
  const [notes, setNotes] = useState(initialNotes);
  const [country, setCountry] = useState("");
  const [sdr, setSdr] = useState("");
  const [, startTransition] = useTransition();

  const countries = [...new Set(accounts.map((a) => a.country))].sort();
  const visible = accounts
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => (!country || a.country === country) && (!sdr || a.sdr === sdr));

  const update = (i: number, patch: Partial<AbmAccountLive>) => {
    setAccounts((cur) => cur.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
    const a = accounts[i];
    startTransition(() => {
      void actionUpdateAccount(a.domain, {
        isTargetAbm: patch.isTargetAbm,
        sdr: patch.sdr,
      });
    });
  };

  const updateNote = (domain: string, body: string) => {
    setNotes((n) => ({ ...n, [domain]: body }));
    startTransition(() => { void actionUpsertNote("account", domain, body); });
  };

  const sel = "rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm";

  return (
    <>
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

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-[var(--subtle)] text-left text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Cuenta</th>
              <th className="px-4 py-3">País</th>
              <th className="px-4 py-3">SDR</th>
              <th className="px-4 py-3">ABM</th>
              <th className="px-4 py-3">Heat Score</th>
              <th className="px-4 py-3">Ads</th>
              <th className="px-4 py-3">Última actividad</th>
              <th className="px-4 py-3">Nota</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ a, i }) => (
              <tr key={a.domain || a.name} className="border-t border-[var(--border)]">
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
                <td className="px-4 py-3 tabular-nums">{a.heatScore !== null ? `${a.heatScore} · ${a.heatBand}` : "—"}</td>
                <td className="px-4 py-3">{a.impactedByAds ? "✅" : "—"}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{a.lastActivity}</td>
                <td className="px-4 py-2">
                  <input
                    defaultValue={notes[a.domain] ?? ""}
                    onBlur={(e) => updateNote(a.domain, e.target.value)}
                    placeholder="Apunte…"
                    className="w-44 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-[var(--muted)]">
        Los cambios se persisten en Supabase. SDR se mapea al `hubspot_owner_id` cuando la integración esté viva.
      </p>
    </>
  );
}
