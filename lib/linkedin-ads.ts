// Ingesta manual de LinkedIn Ads — export "Ad Performance Report" (CSV) de
// Campaign Manager. Fase 1: sin Supermetrics API, carga manual mensual.
// Único canal en este export: PAID_SOCIAL / LinkedIn.
//
// El export es a nivel Ad × día; lo agregamos a Campaign × día para que
// encaje en `ad_spend_daily` (PK: source, platform_campaign_id, date).
// `Campaign Name` es la misma cadena que HubSpot guarda en `utm_campaign`
// (confirmado por Marketing) — se normaliza con `normalizeUtm` para que el
// join `campaign_name_norm = utm_campaign_norm` (kpi_by_campaign_month) case.
//
// País: se deriva de `Campaign Name` — ver lib/campaign-country.ts, que
// comparte la heurística con la carga manual de Google Ads (misma
// convención de naming del equipo de Marketing en ambas plataformas).

import { normalizeUtm } from "@/lib/matching";
import { parseCampaignCountryDetailed } from "@/lib/campaign-country";

export {
  normalizeCountryLabel,
  parseCampaignCountry as parseLinkedInCountry,
  parseCampaignCountryDetailed as parseLinkedInCountryDetailed,
  type ParsedCountry,
} from "@/lib/campaign-country";

// ── Parsing del CSV ────────────────────────────────────────────────────

const REQUIRED_COLUMNS = [
  "Start Date (in UTC)",
  "Campaign ID",
  "Campaign Name",
  "Currency",
  "Total Spent",
  "Impressions",
  "Clicks",
] as const;

// Tokenizer TSV consciente de comillas (RFC 4180 con tab como delimitador).
// Necesario porque varios campos de texto libre (p.ej. "Ad Introduction
// Text") vienen entrecomillados y contienen saltos de línea reales dentro
// de la comilla — un split ingenuo por línea trocea esas filas y descarta
// ~mitad de las filas de datos silenciosamente (bug real, detectado al
// validar contra el export). Aquí el salto de línea solo separa fila
// cuando no estamos dentro de comillas.
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

// Fechas del export: M/D/YYYY (US) o YYYY-MM-DD según versión/idioma del
// Campaign Manager → siempre YYYY-MM-DD.
function parseExportDate(s: string): string {
  const t = s.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!us) throw new Error(`Fecha inválida en export LinkedIn: "${s}"`);
  const [, mo, d, y] = us;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// Números del export: pueden venir con separador de miles ("1,234.56") o
// decimal europeo ("1234,56"); Number() a secas daría NaN → 0 silencioso.
function parseExportNumber(s: string | undefined): number {
  const t = (s ?? "").trim().replace(/[€$\s]/g, "");
  if (!t) return 0;
  let normalized = t;
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) {
    normalized = t.replace(/,/g, ""); // miles US: 1,234.56
  } else if (/^\d+,\d+$/.test(t)) {
    normalized = t.replace(",", "."); // decimal europeo: 1234,56
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export type LinkedInAdRow = {
  date: string; // YYYY-MM-DD
  platformCampaignId: string;
  campaignName: string;
  currency: string;
  spend: number;
  impressions: number;
  clicks: number;
};

// El delimitador del export varía según versión/config regional del
// Campaign Manager (histórico: UTF-16LE + tab; también existe UTF-8 + coma).
// Se prueba cada candidato y gana el que produce una cabecera con TODAS las
// columnas requeridas.
const DELIMITER_CANDIDATES = ["\t", ",", ";"] as const;

type HeaderScan =
  | { ok: true; rows: string[][]; headerIdx: number; header: string[] }
  | { ok: false; reason: string };

function scanWithDelimiter(text: string, delimiter: string): HeaderScan {
  const rows = tokenizeDelimited(text, delimiter).filter((r) => r.some((c) => c.trim() !== ""));
  // La cabecera real es la fila que contiene TODAS las columnas requeridas
  // (el preámbulo puede traer filas de metadatos que también empiezan por
  // "Start Date", así que no vale quedarse con la primera coincidencia).
  let bestMissing: string[] | null = null;
  for (let i = 0; i < rows.length; i++) {
    const header = rows[i].map((c) => c.trim());
    if (!header.some((c) => c.startsWith("Start Date"))) continue;
    const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
    if (missing.length === 0) return { ok: true, rows, headerIdx: i, header };
    if (!bestMissing || missing.length < bestMissing.length) bestMissing = missing;
  }
  if (bestMissing) {
    return { ok: false, reason: `faltan columnas: ${bestMissing.map((c) => `"${c}"`).join(", ")}` };
  }
  return { ok: false, reason: "sin fila de cabecera ('Start Date…')" };
}

export function parseLinkedInAdsCsv(text: string): LinkedInAdRow[] {
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
      `No se pudo leer el archivo como export "Ad Performance Report" de LinkedIn (${failures.join(" · ")}). ` +
        "Comprueba que es el CSV exportado desde Campaign Manager → Analyze → Export, tipo de reporte 'Ad Performance'.",
    );
  }

  const { rows: allRows, headerIdx, header } = scan;
  const colIndex: Record<string, number> = {};
  for (const col of REQUIRED_COLUMNS) colIndex[col] = header.indexOf(col);

  const rows: LinkedInAdRow[] = [];
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const cells = allRows[i];
    if (cells.length < header.length) continue; // fila corrupta/incompleta
    const campaignId = cells[colIndex["Campaign ID"]]?.trim();
    if (!campaignId) continue;

    rows.push({
      date: parseExportDate(cells[colIndex["Start Date (in UTC)"]]),
      platformCampaignId: campaignId,
      campaignName: cells[colIndex["Campaign Name"]].trim(),
      currency: cells[colIndex["Currency"]]?.trim() || "EUR",
      spend: parseExportNumber(cells[colIndex["Total Spent"]]),
      impressions: Math.round(parseExportNumber(cells[colIndex["Impressions"]])),
      clicks: Math.round(parseExportNumber(cells[colIndex["Clicks"]])),
    });
  }
  return rows;
}

// ── Agregación Ad×día → Campaign×día ───────────────────────────────────

export type LinkedInCampaignDaySpend = {
  date: string;
  platformCampaignId: string;
  spend: number;
  currency: string;
  impressions: number;
  clicks: number;
};

export type LinkedInCampaignMeta = {
  platformCampaignId: string;
  campaignName: string;
  campaignNameNorm: string;
  countryParsed: string;
  // true = "Multi" solo por defecto (nombre sin señal de país ni marcador
  // multi) — el flujo de subida pregunta el país antes de guardar.
  countryUncertain: boolean;
  firstSeen: string;
  lastSeen: string;
};

export type LinkedInAdsAggregate = {
  spendRows: LinkedInCampaignDaySpend[];
  campaigns: LinkedInCampaignMeta[];
  totalSpend: number;
  dateRange: { min: string; max: string } | null;
};

export function aggregateLinkedInAds(rows: LinkedInAdRow[]): LinkedInAdsAggregate {
  const spendByKey = new Map<string, LinkedInCampaignDaySpend>();
  const campaignById = new Map<
    string,
    { name: string; firstSeen: string; lastSeen: string }
  >();

  let totalSpend = 0;
  let minDate: string | null = null;
  let maxDate: string | null = null;

  for (const r of rows) {
    const key = `${r.platformCampaignId}|${r.date}`;
    const acc = spendByKey.get(key) ?? {
      date: r.date,
      platformCampaignId: r.platformCampaignId,
      spend: 0,
      currency: r.currency,
      impressions: 0,
      clicks: 0,
    };
    acc.spend += r.spend;
    acc.impressions += r.impressions;
    acc.clicks += r.clicks;
    spendByKey.set(key, acc);

    totalSpend += r.spend;
    if (!minDate || r.date < minDate) minDate = r.date;
    if (!maxDate || r.date > maxDate) maxDate = r.date;

    const c = campaignById.get(r.platformCampaignId);
    if (!c) {
      campaignById.set(r.platformCampaignId, {
        name: r.campaignName,
        firstSeen: r.date,
        lastSeen: r.date,
      });
    } else {
      if (r.date < c.firstSeen) c.firstSeen = r.date;
      if (r.date > c.lastSeen) c.lastSeen = r.date;
      // El nombre puede editarse en LinkedIn a mitad de periodo; nos
      // quedamos con el de la fecha más reciente vista hasta ahora.
      if (r.date >= c.lastSeen) c.name = r.campaignName;
    }
  }

  const campaigns: LinkedInCampaignMeta[] = [...campaignById.entries()].map(
    ([platformCampaignId, c]) => {
      const parsed = parseCampaignCountryDetailed(c.name);
      return {
        platformCampaignId,
        campaignName: c.name,
        campaignNameNorm: normalizeUtm(c.name),
        countryParsed: parsed.country,
        countryUncertain: parsed.uncertain,
        firstSeen: c.firstSeen,
        lastSeen: c.lastSeen,
      };
    },
  );

  return {
    spendRows: [...spendByKey.values()].map((s) => ({
      ...s,
      spend: Math.round(s.spend * 100) / 100,
    })),
    campaigns,
    totalSpend: Math.round(totalSpend * 100) / 100,
    dateRange: minDate && maxDate ? { min: minDate, max: maxDate } : null,
  };
}

// Decodifica el archivo subido: LinkedIn exporta históricamente en UTF-16LE
// con BOM; otras variantes llegan en UTF-8 (con o sin BOM) o UTF-16BE.
export function decodeLinkedInCsv(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let encoding = "utf-8";
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
  else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
  // TextDecoder ya descarta el BOM tanto en UTF-8 como en UTF-16.
  return new TextDecoder(encoding).decode(buf);
}
