// Compelling events por webinar. La property de HubSpot `webinars_registrado`
// (enumeration multi-valor, guardada como lista separada por `;`) lleva los
// códigos de los webinars a los que el contacto se inscribió, p. ej.
// `wb_ppwr-spain_jul26;wb_datos-csrd_sep26`.
//
// Clave del diseño: el código lleva el MES del evento codificado en el sufijo
// (`_jul26`, `_0526`), así que el corte "el deal se abrió después del webinar"
// sale del propio código — sin CSV, sin tabla de fechas ni entrada manual.
//
// Aquí solo vive el parseo (puro y testeable): código → etiqueta legible + mes
// (`YYYY-MM`). El corte por fecha contra el deal se aplica en lib/data/deals.ts.

export type Webinar = {
  code: string;          // código crudo tal cual en HubSpot (clave estable)
  label: string;         // etiqueta legible ("PPWR Spain")
  ym: string | null;     // mes del evento `YYYY-MM`, o null si el código no lo codifica
};

// Meses en español (3 letras) → número. Cubre las dos grafías de septiembre.
const ES_MONTHS: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", sep: "09", set: "09", oct: "10", nov: "11", dic: "12",
};

// Acrónimos que quedan feos con title-case ("Ppwr", "Csrd"): se muestran en
// mayúsculas. El resto de palabras se capitalizan normal.
const ACRONYMS = new Set([
  "ppwr", "csrd", "acv", "sbti", "cdp", "einf", "ia", "esg", "int", "intl", "a3",
]);

const YY_TO_YYYY = (yy: string): string => `20${yy}`;

// Extrae el mes `YYYY-MM` del último segmento del código, si lo codifica.
// Formatos vistos: `jul26` (mes-es + año) y `0526` (MMYY numérico).
function parseYm(token: string): string | null {
  const es = /^([a-z]{3})(\d{2})$/.exec(token);
  if (es && ES_MONTHS[es[1]]) return `${YY_TO_YYYY(es[2])}-${ES_MONTHS[es[1]]}`;
  const num = /^(\d{2})(\d{2})$/.exec(token);
  if (num) {
    const mm = num[1];
    if (mm >= "01" && mm <= "12") return `${YY_TO_YYYY(num[2])}-${mm}`;
  }
  return null;
}

function prettify(words: string[]): string {
  return words
    .flatMap((w) => w.split("-"))
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

// Parsea un único código de webinar. Quita el prefijo `wb_` y, si el último
// segmento es una fecha, la separa de la etiqueta.
export function parseWebinarCode(raw: string): Webinar {
  const code = raw.trim();
  let segs = code.split("_").filter(Boolean);
  if (segs[0]?.toLowerCase() === "wb") segs = segs.slice(1);

  let ym: string | null = null;
  if (segs.length > 0) {
    const maybe = parseYm(segs[segs.length - 1].toLowerCase());
    if (maybe) {
      ym = maybe;
      segs = segs.slice(0, -1);
    }
  }

  const label = segs.length > 0 ? prettify(segs) : code;
  return { code, label, ym };
}

// Parsea la lista completa (`a;b;c`) de la property. Dedup por código.
export function parseWebinarList(raw: string | null | undefined): Webinar[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: Webinar[] = [];
  for (const part of raw.split(/[;,]/)) {
    const code = part.trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(parseWebinarCode(code));
  }
  return out;
}

// Suma `n` meses a un `YYYY-MM` (maneja el cambio de año). Se usa para el
// corte "mismo mes o el siguiente" del compelling event.
export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

// Etiqueta corta de mes para la UI ("jul '26"). Vacío si no hay mes.
const MONTH_LABELS = ["", "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function formatWebinarMonth(ym: string | null): string {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  const mi = Number(m);
  if (!MONTH_LABELS[mi]) return ym;
  return `${MONTH_LABELS[mi]} '${y.slice(2)}`;
}
