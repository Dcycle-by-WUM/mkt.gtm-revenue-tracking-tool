"use client";

import { useId, useState, type ReactNode } from "react";
import { Info } from "lucide-react";

// Tooltip accesible (hover + foco por teclado). Pensado para explicar el origen
// del dato en cabeceras de tabla y labels de KPI. Sin dependencias: burbuja
// posicionada con CSS. `label` es el disparador (por defecto un icono ⓘ).
export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: ReactNode;
  children?: ReactNode;
  side?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  const pos =
    side === "top"
      ? "bottom-full left-1/2 mb-2 -translate-x-1/2"
      : "top-full left-1/2 mt-2 -translate-x-1/2";

  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          setOpen((v) => !v);
        }}
        className="inline-flex cursor-help items-center text-[var(--faint)] transition-colors hover:text-[var(--brand)]"
      >
        {children ?? <Info className="h-3.5 w-3.5" strokeWidth={2} />}
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={`pointer-events-none absolute z-50 ${pos} w-56 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-[var(--text-secondary)] shadow-[var(--shadow-lg)]`}
        >
          {content}
        </span>
      )}
    </span>
  );
}

// Cabecera de tabla con ⓘ que explica el origen del dato. Uso:
//   <ThInfo help="Spend de Supermetrics (LinkedIn+Google)">Spend</ThInfo>
export function ThInfo({
  children,
  help,
  align = "left",
  className = "",
}: {
  children: ReactNode;
  help: ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th className={`px-3 py-2 ${align === "right" ? "text-right" : "text-left"} ${className}`}>
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {children}
        <Tooltip content={help} />
      </span>
    </th>
  );
}
