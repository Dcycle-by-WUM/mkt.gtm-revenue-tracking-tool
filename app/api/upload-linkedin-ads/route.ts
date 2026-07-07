// Carga manual de LinkedIn Ads (Admin → LinkedIn Ads). Route Handler nativo
// de Next.js, no una función Netlify a mano: dos intentos con
// netlify/functions/*.ts (síncrona con timeout=300, luego con sufijo
// `-background`) devolvieron siempre un 500 genérico de plataforma
// ("Internal Error. ID: ...") sin importar la lógica interna — todo apunta
// a que `@netlify/plugin-nextjs` intercepta el routing de `/.netlify/
// functions/*` en vez de dejarlo pasar (sync-crm.ts funciona porque el
// scheduler de Netlify lo invoca directo, sin pasar por esa capa). Un Route
// Handler es justo lo que ese plugin sabe enrutar de forma nativa.
//
// Iba lento además por una razón real (ya arreglada en la migración 0011):
// kpi_by_campaign_month recalculaba leads/mql/sql/pipeline con 5 subqueries
// correlacionadas POR fila de salida — con miles de contactos reales de
// HubSpot eso podía tardar bastante. Con eso corregido, subir un CSV de
// unas pocas miles de filas debería completarse en segundos.

import { NextRequest, NextResponse } from "next/server";
import { ingestLinkedInAdsCsv } from "@/lib/data/ad-spend";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No se recibió ningún archivo." }, { status: 400 });
    }

    const buf = await file.arrayBuffer();
    const summary = await ingestLinkedInAdsCsv(buf);
    return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[upload-linkedin-ads] FAILED → ${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
