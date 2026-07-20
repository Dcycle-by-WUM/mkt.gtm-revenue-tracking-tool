"use client";

import { useEffect, useState } from "react";

// Vistas guardadas: presets (filtros + configuración) que el usuario nombra y
// recupera. Se guardan en localStorage del navegador (no hay identidad de
// usuario todavía — DECISIONES #9), así que son por-navegador. Genérico sobre
// el estado serializable `T`; se reemplaza por nombre para poder "actualizar".
export type SavedView<T> = { name: string; state: T };

export function SavedViews<T>({
  storageKey,
  current,
  onLoad,
}: {
  storageKey: string;
  current: T;
  onLoad: (s: T) => void;
}) {
  const [views, setViews] = useState<SavedView<T>[]>([]);
  const [name, setName] = useState("");
  const [loaded, setLoaded] = useState(false);

  // localStorage solo existe en cliente → cargar tras montar (evita romper el
  // SSR y desajustes de hidratación).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setViews(JSON.parse(raw) as SavedView<T>[]);
    } catch { /* localStorage no disponible / JSON inválido → ignorar */ }
    setLoaded(true);
  }, [storageKey]);

  const persist = (next: SavedView<T>[]) => {
    setViews(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignorar */ }
  };

  const save = () => {
    const n = name.trim();
    if (!n) return;
    persist([...views.filter((v) => v.name !== n), { name: n, state: current }]);
    setName("");
  };

  if (!loaded) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-sm text-[var(--muted)]">Vistas guardadas:</span>
      {views.length === 0 && (
        <span className="text-xs text-[var(--muted)]">ninguna todavía — configura filtros y guárdala →</span>
      )}
      {views.map((v) => (
        <span key={v.name} className="flex items-center gap-1 rounded-md bg-[var(--subtle)] px-2 py-1 text-sm">
          <button onClick={() => onLoad(v.state)} className="hover:text-[var(--accent)]">{v.name}</button>
          <button
            onClick={() => persist(views.filter((x) => x.name !== v.name))}
            className="text-[var(--muted)] hover:text-[var(--warn-text)]"
            aria-label={`borrar vista ${v.name}`}
          >
            ✕
          </button>
        </span>
      ))}
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        placeholder="nombre de la vista"
        className="control w-44"
      />
      <button
        onClick={save}
        className="rounded-lg bg-[var(--accent)]/20 px-3 py-1.5 text-sm text-[var(--accent)] hover:bg-[var(--accent)]/30"
      >
        Guardar vista
      </button>
    </div>
  );
}
