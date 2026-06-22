"use client";

import { useRouter } from "next/navigation";

export function TimelineSelector({ accounts, current }: { accounts: string[]; current: string }) {
  const router = useRouter();
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="text-sm text-[var(--muted)]">Cuenta:</span>
      <select
        className="rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-sm"
        value={current}
        onChange={(e) => {
          const params = new URLSearchParams();
          params.set("account", e.target.value);
          router.push(`/abm-timeline?${params}`);
        }}
      >
        {accounts.map((a) => (
          <option key={a}>{a}</option>
        ))}
      </select>
    </div>
  );
}
