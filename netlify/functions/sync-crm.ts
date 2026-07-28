// Sync horario del CRM (HubSpot → Supabase). PRD §6 / §6.1.
// La lógica vive en lib/sync/crm.ts (compartida con el botón "Actualizar
// HubSpot" de la app). Aquí solo el envoltorio de Netlify + el schedule.

import type { Config } from "@netlify/functions";
import { runCrmSync } from "@/lib/sync/crm";

export default async (): Promise<Response> => {
  const result = await runCrmSync("hubspot");
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
  schedule: "@hourly", // cada hora
};
