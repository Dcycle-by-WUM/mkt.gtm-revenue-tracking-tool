// Carga manual de LinkedIn Ads (Admin → LinkedIn Ads). Route Handler nativo
// de Next.js (los intentos previos con netlify/functions/*.ts devolvían un
// 500 genérico de plataforma; ver historial del repo).
//
// El cliente parsea y agrega el CSV EN EL NAVEGADOR y envía aquí solo el
// agregado campaña×día como JSON (application/json). Motivo: el export de
// LinkedIn es a nivel Ad × día en UTF-16 y puede superar con facilidad el
// límite de payload de las funciones de Netlify (~6 MB) — el CSV crudo nunca
// llegaba al handler y el navegador solo veía un error opaco de plataforma.
// El agregado son unos pocos cientos de KB como mucho y el trabajo del
// servidor queda en upserts + refresh de vistas, muy por debajo del timeout.
//
// Se mantiene la ruta multipart/form-data como legacy (útil para curl):
// recibe el CSV crudo y lo parsea en el servidor, con los límites de arriba.

import { NextRequest, NextResponse } from "next/server";
import { ingestLinkedInAdsCsv, ingestLinkedInAggregate, type ManualCountry } from "@/lib/data/ad-spend";
import type { LinkedInAdsAggregate } from "@/lib/linkedin-ads";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_SPEND_ROWS = 200_000; // ~500 campañas × 365 días — muy por encima de lo real

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Países que el flujo de revisión puede asignar a mano — el mismo
// vocabulario que produce parseLinkedInCountry.
const ALLOWED_COUNTRIES = new Set(["Multi", "Spain", "UK", "USA", "Mexico", "Netherlands", "UAE"]);

// Valida el payload del cliente campo a campo — viene del navegador, no se
// confía en la forma. Devuelve el agregado tipado o lanza con mensaje claro.
function validateAggregatePayload(body: unknown): {
  agg: LinkedInAdsAggregate;
  rowsParsed: number;
  manualCountries: ManualCountry[];
} {
  if (typeof body !== "object" || body === null) throw new Error("Payload JSON vacío o no-objeto.");
  const b = body as Record<string, unknown>;
  const campaigns = b.campaigns;
  const spendRows = b.spendRows;
  if (!Array.isArray(campaigns) || !Array.isArray(spendRows)) {
    throw new Error("Payload inválido: se esperaban arrays `campaigns` y `spendRows`.");
  }
  if (spendRows.length === 0) throw new Error("El agregado no contiene filas de gasto.");
  if (spendRows.length > MAX_SPEND_ROWS || campaigns.length > MAX_SPEND_ROWS) {
    throw new Error(`Payload demasiado grande (${spendRows.length} filas).`);
  }

  const cleanCampaigns = campaigns.map((c, i) => {
    const r = c as Record<string, unknown>;
    if (
      typeof r.platformCampaignId !== "string" || !r.platformCampaignId ||
      typeof r.campaignName !== "string" || !r.campaignName ||
      typeof r.campaignNameNorm !== "string" ||
      typeof r.countryParsed !== "string" ||
      typeof r.firstSeen !== "string" || !DATE_RE.test(r.firstSeen) ||
      typeof r.lastSeen !== "string" || !DATE_RE.test(r.lastSeen)
    ) {
      throw new Error(`Campaña inválida en el payload (índice ${i}).`);
    }
    return {
      platformCampaignId: r.platformCampaignId,
      campaignName: r.campaignName,
      campaignNameNorm: r.campaignNameNorm,
      countryParsed: r.countryParsed,
      countryUncertain: r.countryUncertain === true,
      firstSeen: r.firstSeen,
      lastSeen: r.lastSeen,
    };
  });

  // Decisiones manuales de país del flujo de revisión (opcional).
  const rawManual = Array.isArray(b.manualCountries) ? b.manualCountries : [];
  const manualCountries: ManualCountry[] = rawManual.map((m, i) => {
    const r = m as Record<string, unknown>;
    if (
      typeof r.campaignName !== "string" || !r.campaignName ||
      typeof r.country !== "string" || !ALLOWED_COUNTRIES.has(r.country)
    ) {
      throw new Error(`Asignación manual de país inválida en el payload (índice ${i}).`);
    }
    return { campaignName: r.campaignName, country: r.country };
  });

  let totalSpend = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;
  const cleanSpendRows = spendRows.map((s, i) => {
    const r = s as Record<string, unknown>;
    if (
      typeof r.platformCampaignId !== "string" || !r.platformCampaignId ||
      typeof r.date !== "string" || !DATE_RE.test(r.date) ||
      typeof r.spend !== "number" || !Number.isFinite(r.spend) ||
      typeof r.impressions !== "number" || !Number.isFinite(r.impressions) ||
      typeof r.clicks !== "number" || !Number.isFinite(r.clicks)
    ) {
      throw new Error(`Fila de gasto inválida en el payload (índice ${i}).`);
    }
    totalSpend += r.spend;
    if (!minDate || r.date < minDate) minDate = r.date;
    if (!maxDate || r.date > maxDate) maxDate = r.date;
    return {
      platformCampaignId: r.platformCampaignId,
      date: r.date,
      spend: r.spend,
      currency: typeof r.currency === "string" && r.currency ? r.currency : "EUR",
      impressions: Math.round(r.impressions),
      clicks: Math.round(r.clicks),
    };
  });

  const rowsParsed =
    typeof b.rowsParsed === "number" && Number.isFinite(b.rowsParsed) ? b.rowsParsed : 0;

  return {
    agg: {
      campaigns: cleanCampaigns,
      spendRows: cleanSpendRows,
      totalSpend: Math.round(totalSpend * 100) / 100,
      dateRange: minDate && maxDate ? { min: minDate, max: maxDate } : null,
    },
    rowsParsed,
    manualCountries,
  };
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      let parsed: { agg: LinkedInAdsAggregate; rowsParsed: number; manualCountries: ManualCountry[] };
      try {
        parsed = validateAggregatePayload(await req.json());
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ ok: false, error: msg }, { status: 400 });
      }
      const summary = await ingestLinkedInAggregate(parsed.agg, parsed.rowsParsed, parsed.manualCountries);
      return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
    }

    // Legacy: CSV crudo por multipart (sujeto a límites de payload de la
    // plataforma; el flujo del Admin ya no pasa por aquí).
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No se recibió ningún archivo." }, { status: 400 });
    }
    const summary = await ingestLinkedInAdsCsv(await file.arrayBuffer());
    return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[upload-linkedin-ads] FAILED → ${msg}`);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
