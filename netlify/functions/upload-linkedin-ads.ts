// Carga manual de LinkedIn Ads (Admin → LinkedIn Ads). Función dedicada en
// vez de Server Action: parsear ~6k filas + varios batches de upsert a
// Supabase puede pasar de los ~10s que da el runtime de Next.js en Netlify
// para Server Actions, y una función matada a mitad de request vuelve al
// cliente como respuesta corrupta → "client-side exception" genérico sin
// pista del error real. Mismo patrón que sync-crm.ts: función propia con
// timeout largo declarado en netlify.toml.

import type { Config } from "@netlify/functions";
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
    console.error(`[upload-linkedin-ads] FAILED → ${msg}`);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config: Config = {
  path: "/api/upload-linkedin-ads",
};
