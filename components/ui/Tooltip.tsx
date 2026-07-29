"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

// Tooltip accesible (hover + foco). La burbuja se renderiza en un PORTAL a
// document.body con posición fija, para que NO la recorten los contenedores con
// overflow (tablas con scroll horizontal) — antes se veían "por debajo".
export function Tooltip({ content, children }: { content: ReactNode; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; below: boolean } | null>(null);
  const ref = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const below = r.top < 120; // si no cabe arriba, colócalo debajo
    setCoords({
      top: below ? r.bottom + 8 : r.top - 8,
      left: r.left + r.width / 2,
      below,
    });
  }, [open]);

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={ref}
        type="button"
        aria-label="Más información"
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
      {open && coords && typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              transform: `translate(-50%, ${coords.below ? "0" : "-100%"})`,
            }}
            className="pointer-events-none z-[100] w-56 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-[var(--text-secondary)] shadow-[var(--shadow-lg)]"
          >
            {content}
          </span>,
          document.body,
        )}
    </span>
  );
}
