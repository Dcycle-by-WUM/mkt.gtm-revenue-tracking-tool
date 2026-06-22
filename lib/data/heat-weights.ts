// Pesos / umbrales del Heat Score editables desde Admin — PRD §10.
// Si no hay versión activa en DB, se devuelven los DEFAULTS del algoritmo (§H).

import { getSupabase } from "@/lib/supabase/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type HeatThresholds = { caliente: number; templado: number; tibio: number };
export type HeatWeightsDoc = {
  thresholds: HeatThresholds;
  // Pesos base por señal — claves estables que el algoritmo usa.
  weights: {
    conversionGte5: number;
    conversionGte3: number;
    conversionEq2: number;
    emailReplied: number;
    emailOpensGte10: number;
    emailOpensGte5: number;
    emailOpensGte3: number;
    emailClicksGte10: number;
    emailClicksGte5: number;
    emailClicksGte1: number;
    pageViewsGte20: number;
    pageViewsGte5: number;
    webinar: number;
    demo: number;
    liEngagedMuyAlto: number;
    liEngagedAlto: number;
    liEngagedMedio: number;
  };
};

export const DEFAULT_HEAT_WEIGHTS: HeatWeightsDoc = {
  thresholds: { caliente: 70, templado: 50, tibio: 30 },
  weights: {
    conversionGte5: 35,
    conversionGte3: 30,
    conversionEq2: 18,
    emailReplied: 25,
    emailOpensGte10: 12,
    emailOpensGte5: 8,
    emailOpensGte3: 5,
    emailClicksGte10: 15,
    emailClicksGte5: 10,
    emailClicksGte1: 5,
    pageViewsGte20: 8,
    pageViewsGte5: 4,
    webinar: 8,
    demo: 20,
    liEngagedMuyAlto: 15,
    liEngagedAlto: 8,
    liEngagedMedio: 4,
  },
};

export async function getActiveHeatWeights(): Promise<HeatWeightsDoc> {
  const sb = getSupabase();
  if (!sb) return DEFAULT_HEAT_WEIGHTS;
  const { data } = await sb
    .from("heat_weights")
    .select("weights, thresholds")
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return DEFAULT_HEAT_WEIGHTS;
  return data as HeatWeightsDoc;
}

export async function setActiveHeatWeights(doc: HeatWeightsDoc, name: string): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  await sb.from("heat_weights").update({ is_active: false }).eq("is_active", true);
  await sb.from("heat_weights").insert({
    name,
    weights: doc.weights,
    thresholds: doc.thresholds,
    is_active: true,
    author: "anonymous@dev",
  });
}
