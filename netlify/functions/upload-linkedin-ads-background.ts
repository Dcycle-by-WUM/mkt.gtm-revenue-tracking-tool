// Carga manual de LinkedIn Ads (Admin → LinkedIn Ads). Function Background
// de Netlify (sufijo `-background` en el nombre del fichero): el navegador
// recibe un 202 casi inmediato y el job sigue corriendo hasta 15 min, en
// vez de los ~10-26s que da un endpoint síncrono normal — insuficiente para
// parsear ~6k filas + varios batches de upsert a Supabase. Ya lo intentamos
// como función síncrona normal (con `timeout=300` en netlify.toml) y siguió
// devolviendo un 500 genérico de plataforma: ese override solo aplica de
// verdad a funciones scheduled/background, no a las invocadas por request
// síncrono.
//
// El cliente NO recibe el resultado de este endpoint (Netlify no reenvía la
// respuesta real de una Background Function) — hace polling directo contra
// `sync_runs` (lecturas vía anon key, RLS ya lo permite) hasta ver el run
// que arrancó aquí pasar de "running" a "ok"/"error".

import { ingestLinkedInAdsCsv } from "@/lib/data/ad-spend";

export default async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return new Response(
        JSON.stringify({ ok: false, error: "No se recibió ningún archivo." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const buf = await file.arrayBuffer();
    const summary = await ingestLinkedInAdsCsv(buf);
    return new Response(JSON.stringify(summary), {
      status: summary.ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[upload-linkedin-ads-background] FAILED → ${msg}`);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
