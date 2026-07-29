// Refresco CRM bajo demanda (botón "Actualizar HubSpot"). Dispara el mismo sync
// que el cron horario (lib/sync/crm.ts) sin esperar a la siguiente hora.
// Route Handler nativo de Next.js (como los uploads del Admin).

import { NextResponse } from "next/server";
import { runCrmSync } from "@/lib/sync/crm";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    const result = await runCrmSync("hubspot-manual");
    if ("skipped" in result && result.skipped) {
      // 200: no es un error de la app; falta credencial. El botón lo muestra
      // como aviso, no como fallo.
      return NextResponse.json(result, { status: 200 });
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[refresh-crm] FAILED → ${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
