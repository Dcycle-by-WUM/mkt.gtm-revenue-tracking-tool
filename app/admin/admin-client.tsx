"use client";

import { useState, useTransition } from "react";
import { Panel } from "@/components/Page";
import {
  DEFAULT_HEAT_WEIGHTS,
  type HeatWeightsDoc,
} from "@/lib/data/heat-weights";
import { actionSetHeatWeights } from "@/app/actions";

const SIGNAL_LABELS: Record<keyof HeatWeightsDoc["weights"], string> = {
  conversionGte5: "Conversiones ≥ 5",
  conversionGte3: "Conversiones ≥ 3",
  conversionEq2: "Conversiones = 2",
  emailReplied: "Email respondido",
  emailOpensGte10: "Email opens ≥ 10",
  emailOpensGte5: "Email opens ≥ 5",
  emailOpensGte3: "Email opens ≥ 3",
  emailClicksGte10: "Email clicks ≥ 10",
  emailClicksGte5: "Email clicks ≥ 5",
  emailClicksGte1: "Email clicks ≥ 1",
  pageViewsGte20: "Page views ≥ 20",
  pageViewsGte5: "Page views ≥ 5",
  webinar: "Webinar",
  demo: "Demo",
  liEngagedMuyAlto: "LinkedIn engaged (Muy alto)",
  liEngagedAlto: "LinkedIn engaged (Alto)",
  liEngagedMedio: "LinkedIn engaged (Medio)",
};

export function HeatWeightsEditor({ initial }: { initial: HeatWeightsDoc }) {
  const [doc, setDoc] = useState<HeatWeightsDoc>(initial);
  const [name, setName] = useState("custom-" + new Date().toISOString().slice(0, 10));
  const [saving, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const setW = (k: keyof HeatWeightsDoc["weights"], v: number) =>
    setDoc((d) => ({ ...d, weights: { ...d.weights, [k]: v } }));
  const setT = (k: keyof HeatWeightsDoc["thresholds"], v: number) =>
    setDoc((d) => ({ ...d, thresholds: { ...d.thresholds, [k]: v } }));

  const save = () => {
    startTransition(async () => {
      await actionSetHeatWeights(doc, name);
      setSavedAt(new Date().toLocaleTimeString("es-ES"));
    });
  };

  const reset = () => setDoc(DEFAULT_HEAT_WEIGHTS);

  const inp = "w-16 rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-right text-sm tabular-nums";

  return (
    <Panel title="Pesos del Heat Score (editable)">
      <p className="mb-3 text-xs text-[var(--muted)]">
        Pesos base por señal. El score final = MIN(100, Σ puntos × recencia).
        Multiplicador de recencia: ≤3d ×2.0 · ≤7d ×1.6 · ≤14d ×1.3 · ≤30d ×1.0 · ≤60d ×0.6 · &gt;60d ×0.3.
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {(Object.keys(doc.weights) as (keyof HeatWeightsDoc["weights"])[]).map((k) => (
          <label key={k} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-[var(--muted)]">{SIGNAL_LABELS[k]}</span>
            <input
              type="number"
              className={inp}
              value={doc.weights[k]}
              onChange={(e) => setW(k, +e.target.value)}
            />
          </label>
        ))}
      </div>

      <div className="mb-4 border-t border-[var(--border)] pt-3">
        <div className="mb-2 text-xs uppercase tracking-wide text-[var(--muted)]">Umbrales (bandas)</div>
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">🔥 ≥ <input type="number" className={inp} value={doc.thresholds.caliente} onChange={(e) => setT("caliente", +e.target.value)} /></label>
          <label className="flex items-center gap-2">⚡ ≥ <input type="number" className={inp} value={doc.thresholds.templado} onChange={(e) => setT("templado", +e.target.value)} /></label>
          <label className="flex items-center gap-2">🌱 ≥ <input type="number" className={inp} value={doc.thresholds.tibio} onChange={(e) => setT("tibio", +e.target.value)} /></label>
          <span className="text-[var(--muted)]">❄️ &lt; {doc.thresholds.tibio}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-3">
        <input
          className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre de la versión"
        />
        <button
          disabled={saving}
          onClick={save}
          className="rounded-md bg-[var(--accent)]/20 px-3 py-1.5 text-sm text-[var(--accent)] hover:bg-[var(--accent)]/30 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Activar esta versión"}
        </button>
        <button onClick={reset} className="text-xs text-[var(--muted)] underline">Restablecer defaults §10</button>
        {savedAt && <span className="text-xs text-[var(--good-text)]">Guardado a las {savedAt}</span>}
      </div>
    </Panel>
  );
}
