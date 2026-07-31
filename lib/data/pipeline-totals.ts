// Fachada de lectura del pipeline TOTAL de new business — grano mes × pipeline.
//
// A diferencia de `lib/data/deals.ts` (que lee `deal_attribution`, ya scoped a
// inbound), esto lee la tabla `deals` CRUDA para los tres pipelines de new
// business (AE, DACH, International — ver lib/pipelines.ts) SIN filtrar por
// fuente. Así obtenemos todo el pipeline abierto en el mes, venga de inbound o
// de outbound/offline, para poder enseñar el total y el % de inbound sobre él.
//
// Se agrega en TS (el cliente JS de Supabase no hace GROUP BY): traemos solo
// las columnas necesarias de los deals de esos pipelines y sumamos por
// (mes, pipeline). El importe usa el mismo criterio que `deal_attribution`
// (`coalesce(amount_in_home_currency, amount)`) para que inbound ⊆ total y el
// % nunca pase de 100%.

import { getSupabase } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { TOTAL_PIPELINE_IDS, pipelineLabelById } from "@/lib/pipelines";

export type PipelineTotalRow = {
  month: string; // YYYY-MM (por createdate del deal)
  pipelineId: string;
  pipelineLabel: string;
  amount: number; // suma de coalesce(amount_in_home_currency, amount)
  deals: number;
};

type DbDealTotal = {
  pipeline: string | null;
  amount: number | null;
  amount_in_home_currency: number | null;
  createdate: string | null;
};

// Mock para previews sin Supabase. El inbound del mock (suma de mockCampaigns)
// en 2026-06 ronda los ~309.000 €; el total mock lo supera con DACH + algo de
// outbound, para que el % de inbound quede en un rango ilustrativo (~74%).
// En producción inbound ⊆ total por construcción, así que el % ≤ 100%.
const mockPipelineTotals: PipelineTotalRow[] = [
  { month: "2026-06", pipelineId: "7888791", pipelineLabel: "AE Pipeline", amount: 210000, deals: 22 },
  { month: "2026-06", pipelineId: "883841939", pipelineLabel: "DACH Pipeline", amount: 90000, deals: 8 },
  { month: "2026-06", pipelineId: "727373069", pipelineLabel: "International Pipeline", amount: 120000, deals: 12 },
  { month: "2026-05", pipelineId: "7888791", pipelineLabel: "AE Pipeline", amount: 90000, deals: 10 },
  { month: "2026-05", pipelineId: "883841939", pipelineLabel: "DACH Pipeline", amount: 30000, deals: 3 },
];

export async function listPipelineTotals(): Promise<PipelineTotalRow[]> {
  const sb = getSupabase();
  if (!sb) return mockPipelineTotals;

  const rows = await fetchAll<DbDealTotal>(() =>
    sb
      .from("deals")
      .select("pipeline, amount, amount_in_home_currency, createdate")
      .in("pipeline", TOTAL_PIPELINE_IDS)
      .not("createdate", "is", null),
  );

  // Agrega en TS por (mes, pipeline).
  const acc = new Map<string, PipelineTotalRow>();
  for (const r of rows) {
    if (!r.pipeline || !r.createdate) continue;
    const month = r.createdate.slice(0, 7); // YYYY-MM
    const amount = Number(r.amount_in_home_currency ?? r.amount) || 0;
    const key = `${month}|${r.pipeline}`;
    const cur = acc.get(key);
    if (cur) {
      cur.amount += amount;
      cur.deals += 1;
    } else {
      acc.set(key, {
        month,
        pipelineId: r.pipeline,
        pipelineLabel: pipelineLabelById(r.pipeline),
        amount,
        deals: 1,
      });
    }
  }
  return [...acc.values()];
}
