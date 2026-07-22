// Targets (forecast) — PRD §8.5. Objetivos editables; el "real" no se guarda
// aquí, se calcula en runtime a partir de spend/pipeline atribuidos.

import { getSupabase } from "@/lib/supabase/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { mockForecast, type ForecastRow } from "@/lib/mock-data";
import type { DbTarget } from "@/lib/supabase/types";

const fromDb = (r: DbTarget): ForecastRow => ({
  channel: r.channel,
  month: r.month,
  country: r.country,
  targetSpend: Number(r.target_spend) || 0,
  targetPipeline: Number(r.target_pipeline) || 0,
});

export async function listTargets(): Promise<ForecastRow[]> {
  const sb = getSupabase();
  if (!sb) return mockForecast;
  const { data, error } = await sb
    .from("targets")
    .select("*")
    .order("month", { ascending: false });
  if (error || !data || data.length === 0) return mockForecast;
  return (data as DbTarget[]).map(fromDb);
}

export async function upsertTarget(t: ForecastRow): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) return;
  await sb.from("targets").upsert(
    {
      channel: t.channel,
      month: t.month,
      country: t.country,
      target_spend: t.targetSpend,
      target_pipeline: t.targetPipeline,
      author: "anonymous@dev",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "channel,month,country" },
  );
}
