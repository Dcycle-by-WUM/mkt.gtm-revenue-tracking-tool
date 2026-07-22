// Ingesta manual de Google Ads — export "Campaign performance" (CSV) de la
// UI de Google Ads. Misma lógica que LinkedIn Ads (lib/linkedin-ads.ts):
// carga manual mensual, sin Supermetrics API. Único canal en este export:
// PAID_SEARCH / Google.
//
// Diferencia clave frente al export de LinkedIn: este report es a nivel
// Campaign × PERIODO (no Ad × día) — cada fila ya es el total de la
// campaña para el rango de fechas del título ("January 1, 2026 - January
// 31, 2026"), y no trae un ID de campaña propio, solo el nombre. Por eso:
//   - `platformCampaignId` = el propio nombre de campaña (normalizado no,
//     tal cual) — es el único identificador estable que trae el export.
//   - no hay Ad×día que agregar a Campaign×día: cada fila YA es una
//     campaña; el "agregado" solo necesita convertir tipos y deduplicar
//     por si el mismo nombre apareciera dos veces en un export.
//   - el spend se guarda como una única fila en `ad_spend_daily` fechada
//     el PRIMER día del periodo (el mes completo, dado el flujo mensual) —
//     kpi_by_campaign_month agrupa por mes, así que basta con que la fecha
//     caiga en el mes correcto; no hace falta (ni se puede, sin columna de
//     día) repartir el spend día a día.
//
// `Campaign` es la misma cadena que HubSpot guarda en `utm_campaign`
// (confirmado por Marketing, igual que en LinkedIn) — se normaliza con
// `normalizeUtm` para el join `campaign_name_norm = utm_campaign_norm`
// (kpi_by_campaign_month). País: ver lib/campaign-country.ts (heurística
// compartida con LinkedIn — misma convención de naming del equipo).

import { normalizeUtm } from "@/lib/matching";
import { parseCampaignCountryDetailed } from "@/lib/campaign-country";

export { normalizeCountryLabel, parseCampaignCountry, type ParsedCountry } from "@/lib/campaign-country";

// ── Parsing del CSV ────────────────────────────────────────────────────

// Columnas mínimas para reconocer la cabecera; el resto (CTR, Avg. CPC,
// Conversions…) no se usa — el rendimiento de conversión lo gobierna
// HubSpot, no las métricas propias de Google.
const REQUIRED_COLUMNS = ["Campaign", "Cost"] as const;
// Opcionales: si el export no las trae, se guardan a 0 / "EUR" en vez de
// fallar (a diferencia de REQUIRED_COLUMNS, cuya ausencia sí aborta el parseo).
const OPTIONAL_COLUMNS = ["Clicks", "Impr.", "Currency code"] as const;

// Tokenizer CSV/TSV consciente de comillas (RFC 4180). Idéntico al de
// lib/linkedin-ads.ts: necesario porque el rango de fechas del título viene
// entrecomillado y contiene comas ("January 1, 2026 - January 31, 2026")
// que un split ingenuo por coma trocearía.
function tokenizeDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAny = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      sawAny = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
      sawAny = true;
    } else if (ch === "\r") {
      continue;
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      sawAny = false;
    } else {
      field += ch;
      sawAny = true;
    }
  }
  if (sawAny || field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Números del export: "1,234.56" (miles US) o "4,752" (miles sin decimales)
// o "405.13" simple; también "3.91%" en columnas que no usamos. Number() a
// secas daría NaN → 0 silencioso en los miles con coma.
function parseExportNumber(s: string | undefined): number {
  const t = (s ?? "").trim().replace(/[€$%\s]/g, "");
  if (!t) return 0;
  let normalized = t;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) {
    normalized = t.replace(/,/g, ""); // miles US: 1,234.56 / 4,752
  } else if (/^\d+,\d+$/.test(t)) {
    normalized = t.replace(",", "."); // decimal europeo: 1234,56
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// Rango de fechas del título ("January 1, 2026 - January 31, 2026") — solo
// inglés, que es el idioma del export usado hasta ahora. Si el rango cruza
// de mes se rechaza: sin columna de día por fila no hay forma de repartir
// el spend correctamente entre los dos meses.
function parseDateRangeLabel(label: string): { start: string; end: string } | null {
  const m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\s*-\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(
    label.trim(),
  );
  if (!m) return null;
  const [, mo1, d1, y1, mo2, d2, y2] = m;
  const mn1 = MONTHS[mo1.toLowerCase()];
  const mn2 = MONTHS[mo2.toLowerCase()];
  if (!mn1 || !mn2) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    start: `${y1}-${pad(mn1)}-${pad(Number(d1))}`,
    end: `${y2}-${pad(mn2)}-${pad(Number(d2))}`,
  };
}

export type GoogleAdRow = {
  campaignName: string;
  currency: string;
  spend: number;
  impressions: number;
  clicks: number;
};

const DELIMITER_CANDIDATES = [",", "\t", ";"] as const;

type HeaderScan =
  | { ok: true; rows: string[][]; headerIdx: number; header: string[] }
  | { ok: false; reason: string };

function scanWithDelimiter(text: string, delimiter: string): HeaderScan {
  const rows = tokenizeDelimited(text, delimiter).filter((r) => r.some((c) => c.trim() !== ""));
  // La cabecera real es la primera fila que contiene TODAS las columnas
  // requeridas — el preámbulo trae el título del report y el rango de
  // fechas, que también podrían tokenizar como filas de una sola celda.
  let bestMissing: string[] | null = null;
  for (let i = 0; i < rows.length; i++) {
    const header = rows[i].map((c) => c.trim());
    const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
    if (missing.length === 0) return { ok: true, rows, headerIdx: i, header };
    if (!bestMissing || missing.length < bestMissing.length) bestMissing = missing;
  }
  if (bestMissing) {
    return { ok: false, reason: `faltan columnas: ${bestMissing.map((c) => `"${c}"`).join(", ")}` };
  }
  return { ok: false, reason: "sin fila de cabecera reconocible" };
}

export type GoogleAdsCsvParsed = {
  rows: GoogleAdRow[];
  period: { start: string; end: string };
};

export function parseGoogleAdsCsv(text: string): GoogleAdsCsvParsed {
  const failures: string[] = [];
  let scan: Extract<HeaderScan, { ok: true }> | null = null;
  for (const delimiter of DELIMITER_CANDIDATES) {
    const attempt = scanWithDelimiter(text, delimiter);
    if (attempt.ok) {
      scan = attempt;
      break;
    }
    failures.push(`${delimiter === "\t" ? "tab" : `"${delimiter}"`}: ${attempt.reason}`);
  }
  if (!scan) {
    throw new Error(
      `No se pudo leer el archivo como export "Campaign performance" de Google Ads (${failures.join(" · ")}). ` +
        "Comprueba que es el CSV exportado desde Google Ads → Campañas → Descargar → CSV.",
    );
  }

  const { rows: allRows, headerIdx, header } = scan;

  // Rango de fechas: se busca en el preámbulo (filas antes de la cabecera)
  // una celda única que matchee "Mes D, YYYY - Mes D, YYYY".
  let period: { start: string; end: string } | null = null;
  for (let i = 0; i < headerIdx; i++) {
    const cell = allRows[i][0];
    if (!cell) continue;
    const parsed = parseDateRangeLabel(cell);
    if (parsed) {
      period = parsed;
      break;
    }
  }
  if (!period) {
    throw new Error(
      "No se pudo determinar el periodo (rango de fechas) del export de Google Ads. " +
        "Comprueba que es el reporte \"Campaign performance\" con el rango de fechas visible en la segunda fila del CSV.",
    );
  }
  if (period.start.slice(0, 7) !== period.end.slice(0, 7)) {
    throw new Error(
      `El rango del export (${period.start} → ${period.end}) cruza de mes. ` +
        "Exporta un mes natural completo cada vez (igual que con LinkedIn Ads).",
    );
  }

  const colIndex: Record<string, number> = {};
  for (const col of REQUIRED_COLUMNS) colIndex[col] = header.indexOf(col);
  for (const col of OPTIONAL_COLUMNS) colIndex[col] = header.indexOf(col);

  const rows: GoogleAdRow[] = [];
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const cells = allRows[i];
    const campaignName = cells[colIndex["Campaign"]]?.trim();
    if (!campaignName) continue; // fila vacía/de cierre del export

    rows.push({
      campaignName,
      currency: (colIndex["Currency code"] >= 0 && cells[colIndex["Currency code"]]?.trim()) || "EUR",
      spend: parseExportNumber(cells[colIndex["Cost"]]),
      impressions: colIndex["Impr."] >= 0 ? Math.round(parseExportNumber(cells[colIndex["Impr."]])) : 0,
      clicks: colIndex["Clicks"] >= 0 ? Math.round(parseExportNumber(cells[colIndex["Clicks"]])) : 0,
    });
  }
  return { rows, period };
}

// ── Agregación Campaign×periodo ────────────────────────────────────────
// A diferencia de LinkedIn (Ad×día → Campaign×día), aquí cada fila del CSV
// YA es una campaña para todo el periodo — solo hace falta deduplicar por
// si el mismo nombre apareciera dos veces (defensivo, no debería pasar en
// un export real) y adjuntar el periodo como fecha de la fila de spend.

export type GoogleCampaignSpend = {
  date: string; // primer día del periodo (mes natural)
  platformCampaignId: string; // = nombre de campaña — el export no trae ID
  spend: number;
  currency: string;
  impressions: number;
  clicks: number;
};

export type GoogleCampaignMeta = {
  platformCampaignId: string;
  campaignName: string;
  campaignNameNorm: string;
  countryParsed: string;
  countryUncertain: boolean;
  firstSeen: string;
  lastSeen: string;
};

export type GoogleAdsAggregate = {
  spendRows: GoogleCampaignSpend[];
  campaigns: GoogleCampaignMeta[];
  totalSpend: number;
  dateRange: { min: string; max: string } | null;
};

export function aggregateGoogleAds(parsed: GoogleAdsCsvParsed): GoogleAdsAggregate {
  const { rows, period } = parsed;
  const spendByName = new Map<string, GoogleCampaignSpend>();
  let totalSpend = 0;

  for (const r of rows) {
    const acc = spendByName.get(r.campaignName) ?? {
      date: period.start,
      platformCampaignId: r.campaignName,
      spend: 0,
      currency: r.currency,
      impressions: 0,
      clicks: 0,
    };
    acc.spend += r.spend;
    acc.impressions += r.impressions;
    acc.clicks += r.clicks;
    spendByName.set(r.campaignName, acc);
    totalSpend += r.spend;
  }

  const campaigns: GoogleCampaignMeta[] = [...spendByName.keys()].map((campaignName) => {
    const parsedCountry = parseCampaignCountryDetailed(campaignName);
    return {
      platformCampaignId: campaignName,
      campaignName,
      campaignNameNorm: normalizeUtm(campaignName),
      countryParsed: parsedCountry.country,
      countryUncertain: parsedCountry.uncertain,
      firstSeen: period.start,
      lastSeen: period.end,
    };
  });

  return {
    spendRows: [...spendByName.values()].map((s) => ({
      ...s,
      spend: Math.round(s.spend * 100) / 100,
    })),
    campaigns,
    totalSpend: Math.round(totalSpend * 100) / 100,
    dateRange: { min: period.start, max: period.end },
  };
}

// Decodifica el archivo subido. El export de Google Ads es normalmente
// UTF-8 (con o sin BOM), pero se sniffea igual que LinkedIn por si acaso.
export function decodeGoogleAdsCsv(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let encoding = "utf-8";
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
  else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
  return new TextDecoder(encoding).decode(buf);
}
