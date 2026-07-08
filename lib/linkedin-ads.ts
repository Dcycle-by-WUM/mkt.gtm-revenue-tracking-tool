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
// País: este report no trae Campaign Group (solo Supermetrics lo expondría),
// así que el país se deriva de la propia `Campaign Name` por convención de
// naming: prefijo `ESP`/`España` → Spain; prefijo `INT` + código de país
// (`UK`, `USA`/`California`, `Mexico`/`MEX`, `Holanda`/`Dutch`, `EAU`) → ese
// país; `INT` sin código, con `MULTI`/`EUROPA`, o con ≥2 códigos distintos →
// Multi (decisión Davide, 07-jul). `TIERMULTI` es un sufijo de tier de
// audiencia (no de país) y se ignora explícitamente.

import { normalizeUtm } from "@/lib/matching";

// Quita diacríticos (Ñ→N, Á→A…) descomponiendo a NFD y filtrando la clase
// Unicode "Mark, Nonspacing" (evita escribir el rango de combining marks
// como literal de regex, propenso a corrupción de encoding).
function stripAccents(s: string): string {
  return Array.from(s.normalize("NFD"))
    .filter((ch) => {
      const code = ch.codePointAt(0)!;
      return !(code >= 0x0300 && code <= 0x036f);
    })
    .join("");
}

// Ciudades/regiones cuentan como su país (mismo criterio que CALIFORNIA→USA):
// el naming real usa LONDRES/AMSTERDAM/MADRID para campañas de evento locales.
// ESP/ESPANA también como token (no solo como prefijo): hay campañas
// "Dcycle / ESP_..." donde ESP no es el primer token.
const COUNTRY_TOKENS: Record<string, string> = {
  UK: "UK",
  LONDRES: "UK",
  LONDON: "UK",
  USA: "USA",
  CALIFORNIA: "USA",
  MEXICO: "Mexico",
  MEX: "Mexico",
  HOLANDA: "Netherlands",
  DUTCH: "Netherlands",
  NETHERLANDS: "Netherlands",
  EAU: "UAE",
  EMIRATOS: "UAE",
  ESP: "Spain",
  ESPANA: "Spain",
  MADRID: "Spain",
};

// Exactamente un país específico entre los tokens → ese país gana, aunque
// "MULTI"/"EUROPA" también aparezca en el nombre. 0 países (genérico) o ≥2
// distintos (campaña multi-país real) → null (llamador decide el default).
function singleCountryToken(tokens: string[]): string | null {
  const specific = new Set<string>();
  for (const t of tokens) {
    if (t in COUNTRY_TOKENS) specific.add(COUNTRY_TOKENS[t]);
  }
  return specific.size === 1 ? [...specific][0] : null;
}

// Nombres que anuncian multi-país a propósito (INT genérico, EUROPA…) son
// "Multi" con confianza; un nombre SIN ninguna señal (ni país ni marcador)
// cae en Multi solo por defecto → `uncertain`, y el flujo de subida le
// pregunta el país a quien sube el CSV (decisión Davide, 08-jul).
const MULTI_MARKERS = new Set(["INT", "INTERNATIONAL", "MULTI", "EUROPA", "EUROPE", "EU"]);

export type ParsedCountry = { country: string; uncertain: boolean };

export function parseLinkedInCountry(campaignName: string): string {
  return parseLinkedInCountryDetailed(campaignName).country;
}

export function parseLinkedInCountryDetailed(campaignName: string): ParsedCountry {
  const clean = stripAccents(campaignName.trim()).toUpperCase();
  if (clean.includes("UNITED KINGDOM")) return { country: "UK", uncertain: false };

  // El país solo se lee de la CABECERA del nombre: lo que va antes del
  // primer "|" o " - ". El resto describe audiencia/oferta y puede citar
  // países que no determinan el targeting (p.ej. "…[BOFU] - 50$ Amazon -
  // CIOs - UK" o "…Stop reporting Twice - Davide | UK 16k" son Multi).
  // Regla validada contra la tabla de atribución manual de Davide (08-jul):
  // 306 campañas, el criterio cabecera + tokens resuelve ~92%.
  const pipeIdx = clean.indexOf("|");
  const dashIdx = clean.indexOf(" - ");
  let headerEnd = clean.length;
  if (pipeIdx !== -1 && pipeIdx < headerEnd) headerEnd = pipeIdx;
  if (dashIdx !== -1 && dashIdx < headerEnd) headerEnd = dashIdx;

  const tokens = clean
    .slice(0, headerEnd)
    .split(/[^A-Z0-9]+/)
    .filter((t) => t && t !== "TIERMULTI");
  if (tokens.length === 0) return { country: "Multi", uncertain: true };

  if (tokens[0] === "ESP" || tokens[0] === "ESPANA") return { country: "Spain", uncertain: false };

  // Un único token de país reconocido en la cabecera → ese país; 0 (genérico/
  // EUROPA/MULTI) o ≥2 distintos (multi-país real) → Multi. Aplica con y sin
  // prefijo INT_ — el naming legacy ("UK_…", "IP UK…", "MADRID | …") no lo
  // lleva y antes caía en Multi por defecto (bug real, pivot de Davide).
  const country = singleCountryToken(tokens);
  if (country) return { country, uncertain: false };
  return { country: "Multi", uncertain: !tokens.some((t) => MULTI_MARKERS.has(t)) };
}

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
      const parsed = parseLinkedInCountryDetailed(c.name);
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
