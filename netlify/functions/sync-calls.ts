// Sync de LLAMADAS (métrica SDRs Overview), en su PROPIA scheduled function.
// El volumen histórico (~82k) no cabe en el sync principal (que además alimenta
// el botón "Actualizar HubSpot" con timeout corto), así que va aparte, con el
// mismo timeout largo (300s) que `sync-crm` — ver netlify.toml.
//
// Idempotente e incremental: `lib/sync/crm.ts:runCallsSync` reanuda por marca
// de agua desde `activities`, así que si una corrida no termina el backfill, la
// siguiente continúa. Programado a :30 para no solapar con `sync-crm` (:00).

import type { Config } from "@netlify/functions";
import { runCallsSync } from "@/lib/sync/crm";

export default async (): Promise<Response> => {
  const result = await runCallsSync("calls");
  if ("skipped" in result && result.skipped) {
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(JSON.stringify(result, null, 2), {
    status: result.ok ? 200 : 500,
    headers: { "Content-Type": "application/json" },
  });
};

export const config: Config = {
  schedule: "30 * * * *", // cada hora en el minuto :30 (desfasado de sync-crm)
};
