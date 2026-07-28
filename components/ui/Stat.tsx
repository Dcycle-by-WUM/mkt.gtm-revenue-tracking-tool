import { type ReactNode } from "react";
import { Tooltip } from "./Tooltip";

// Tarjeta de KPI reutilizable (dashboard + pantallas). Valor grande, label con
// tooltip de origen opcional, y un delta/subtítulo opcional.
export function Stat({
  label,
  value,
  help,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: ReactNode;
  help?: ReactNode;
  hint?: ReactNode;
  tone?: "neutral" | "good" | "warn" | "error" | "brand";
  icon?: ReactNode;
}) {
  const toneCls: Record<string, string> = {
    neutral: "text-[var(--text)]",
    good: "text-[var(--good-text)]",
    warn: "text-[var(--warn-text)]",
    error: "text-[var(--error-text)]",
    brand: "text-[var(--brand)]",
  };
  return (
    <div className="card p-4">
      <div className="mb-1.5 flex items-center gap-1.5">
        {icon && <span className="text-[var(--faint)]">{icon}</span>}
        <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</span>
        {help && <Tooltip content={help} />}
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${toneCls[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div>}
    </div>
  );
}
