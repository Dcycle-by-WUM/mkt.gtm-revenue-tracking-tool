"use client";

import { useEffect, useState } from "react";

// Estado persistido en localStorage. En el prototipo permite editar notas,
// forecast y overrides de país y que persistan en el navegador.
// En producción esto se reemplaza por lecturas/escrituras a Supabase.
export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore */
    }
    setLoaded(true);
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value, loaded]);

  return [value, setValue, loaded] as const;
}
