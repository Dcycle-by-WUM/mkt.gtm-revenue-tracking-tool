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

const COUNTRY_TOKENS: Record<string, string> = {
  UK: "UK",
  USA: "USA",
  CALIFORNIA: "USA",
  MEXICO: "Mexico",
  MEX: "Mexico",
  HOLANDA: "Netherlands",
  DUTCH: "Netherlands",
  NETHERLANDS: "Netherlands",
  EAU: "UAE",
};

export function parseLinkedInCountry(campaignName: string): string {
  const clean = stripAccents(campaignName.trim()).toUpperCase();
  if (clean.includes("UNITED KINGDOM")) return "UK";

  const tokens = clean
    .split(/[^A-Z0-9]+/)
    .filter((t) => t && t !== "TIERMULTI");
  if (tokens.length === 0) return "Multi";

  if (tokens[0] === "ESP" || tokens[0] === "ESPANA") return "Spain";

  if (tokens[0] === "INT" || tokens[0] === "INTERNATIONAL") {
    const specific = new Set<string>();
    for (const t of tokens) {
      if (t in COUNTRY_TOKENS) specific.add(COUNTRY_TOKENS[t]);
    }
    // Exactamente un país específico → ese país gana, aunque "MULTI"/"EUROPA"
    // también aparezca en el nombre. 0 países (genérico) o ≥2 distintos
    // (campaña multi-país real) → Multi.
    if (specific.size === 1) return [...specific][0];
    return "Multi";
  }

  // Sin prefijo ESP/INT (naming legacy/suelto) → Multi por defecto.
  return "Multi";
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

// Fechas del export vienen como M/D/YYYY (US) → YYYY-MM-DD.
function parseUsDate(s: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) throw new Error(`Fecha inválida en export LinkedIn: "${s}"`);
  const [, mo, d, y] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
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

// Localiza la fila de cabecera real (el export trae 4-5 líneas de preámbulo
// con metadatos del reporte antes de la fila de columnas).
function findHeaderLine(rows: string[][]): number {
  const idx = rows.findIndex((r) => r[0]?.trim().startsWith("Start Date"));
  if (idx === -1) {
    throw new Error(
      "No se encontró la fila de cabecera ('Start Date...') — ¿es un export de Ad Performance Report?",
    );
  }
  return idx;
}

export function parseLinkedInAdsCsv(text: string): LinkedInAdRow[] {
  const allRows = tokenizeDelimited(text, "\t").filter((r) => r.some((c) => c.trim() !== ""));
  const headerIdx = findHeaderLine(allRows);
  const header = allRows[headerIdx].map((c) => c.trim());

  const colIndex: Record<string, number> = {};
  for (const col of REQUIRED_COLUMNS) {
    const i = header.indexOf(col);
    if (i === -1) {
      throw new Error(`Columna requerida no encontrada en el CSV: "${col}"`);
    }
    colIndex[col] = i;
  }

  const rows: LinkedInAdRow[] = [];
  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const cells = allRows[i];
    if (cells.length < header.length) continue; // fila corrupta/incompleta
    const campaignId = cells[colIndex["Campaign ID"]]?.trim();
    if (!campaignId) continue;

    rows.push({
      date: parseUsDate(cells[colIndex["Start Date (in UTC)"]]),
      platformCampaignId: campaignId,
      campaignName: cells[colIndex["Campaign Name"]].trim(),
      currency: cells[colIndex["Currency"]]?.trim() || "EUR",
      spend: Number(cells[colIndex["Total Spent"]]) || 0,
      impressions: Number(cells[colIndex["Impressions"]]) || 0,
      clicks: Number(cells[colIndex["Clicks"]]) || 0,
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
    ([platformCampaignId, c]) => ({
      platformCampaignId,
      campaignName: c.name,
      campaignNameNorm: normalizeUtm(c.name),
      countryParsed: parseLinkedInCountry(c.name),
      firstSeen: c.firstSeen,
      lastSeen: c.lastSeen,
    }),
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

// Decodifica el archivo subido: LinkedIn exporta en UTF-16LE con BOM.
export function decodeLinkedInCsv(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const isUtf16Le = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
  const decoder = new TextDecoder(isUtf16Le ? "utf-16le" : "utf-8");
  return decoder.decode(buf);
}
