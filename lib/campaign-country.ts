// País derivado del NOMBRE de campaña — compartido por todas las fuentes paid
// de carga manual (LinkedIn Ads, Google Ads) que siguen la misma convención
// de naming del equipo de Marketing (prefijo de país en la cabecera del
// nombre). Extraído de lib/linkedin-ads.ts para no duplicar la heurística
// cuando se añadió Google Ads: la convención de nombres es la misma en
// ambas plataformas, así que el parseo también debe serlo.
//
// País: ningún export (LinkedIn Ad Performance Report, Google Ads Campaign
// performance) trae un campo de país fiable, así que se deriva de la propia
// `Campaign Name` por convención de naming: prefijo `ESP`/`España` → Spain;
// prefijo `INT` + código de país (`UK`, `USA`/`California`, `Mexico`/`MEX`,
// `Holanda`/`Dutch`, `EAU`, `GER`/`Alemania`) → ese país; `INT` sin código,
// con `MULTI`/`EUROPA`, o con ≥2 códigos distintos → Multi (decisión Davide,
// 07-jul). `TIERMULTI` es un sufijo de tier de audiencia (no de país) y se
// ignora explícitamente.

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
  NETH: "Netherlands",
  EAU: "UAE",
  EMIRATOS: "UAE",
  ESP: "Spain",
  ESPANA: "Spain",
  MADRID: "Spain",
  GER: "Germany",
  GERMANY: "Germany",
  ALEMANIA: "Germany",
  DEUTSCHLAND: "Germany",
};

function countryTokenSet(tokens: string[]): Set<string> {
  const specific = new Set<string>();
  for (const t of tokens) {
    if (t in COUNTRY_TOKENS) specific.add(COUNTRY_TOKENS[t]);
  }
  return specific;
}

// Etiquetas de país almacenadas (country_overrides, ediciones manuales…)
// pueden venir en otro vocabulario ("ES", "España", "NETHERLAND") — se
// normalizan al canon del parser para no fragmentar los buckets del
// desglose ("ES" y "Spain" serían dos países distintos en la vista).
const COUNTRY_LABELS: Record<string, string> = {
  ES: "Spain", ESP: "Spain", ESPANA: "Spain", SPAIN: "Spain",
  UK: "UK", GB: "UK", "UNITED KINGDOM": "UK",
  US: "USA", USA: "USA", EEUU: "USA", "UNITED STATES": "USA",
  MX: "Mexico", MEX: "Mexico", MEXICO: "Mexico",
  NL: "Netherlands", NETHERLANDS: "Netherlands", NETHERLAND: "Netherlands", HOLANDA: "Netherlands",
  UAE: "UAE", EAU: "UAE", ARAB: "UAE",
  DE: "Germany", GERMANY: "Germany", ALEMANIA: "Germany", DEUTSCHLAND: "Germany",
  // FR/IT no aparecen (todavía) como token de nombre de campaña, pero SÍ como
  // opción del selector de país de Explorer — sin esto, un override "FR"/"IT"
  // se re-horneaba en campaigns.country_parsed tal cual, sin normalizar.
  FR: "France", FRANCE: "France", FRANCIA: "France",
  IT: "Italy", ITALY: "Italy", ITALIA: "Italy",
  MULTI: "Multi",
};

export function normalizeCountryLabel(value: string): string {
  const key = stripAccents(value.trim()).toUpperCase();
  return COUNTRY_LABELS[key] ?? value.trim();
}

// Países que un flujo de revisión (subida manual) puede asignar a mano —
// mismo vocabulario que produce parseCampaignCountry. Consumido por el
// selector del cliente y por la validación del servidor en ambas rutas de
// subida (LinkedIn, Google Ads).
export const COUNTRY_CHOICES = [
  "Multi", "Spain", "UK", "USA", "Mexico", "Netherlands", "UAE", "Germany",
] as const;

// Nombres que anuncian multi-país a propósito (INT genérico, EUROPA…) son
// "Multi" con confianza; un nombre SIN ninguna señal (ni país ni marcador)
// cae en Multi solo por defecto → `uncertain`, y el flujo de subida le
// pregunta el país a quien sube el CSV (decisión Davide, 08-jul).
const MULTI_MARKERS = new Set(["INT", "INTERNATIONAL", "MULTI", "EUROPA", "EUROPE", "EU"]);

export type ParsedCountry = { country: string; uncertain: boolean };

export function parseCampaignCountry(campaignName: string): string {
  return parseCampaignCountryDetailed(campaignName).country;
}

export function parseCampaignCountryDetailed(campaignName: string): ParsedCountry {
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
  // EUROPA/MULTI) o ≥2 distintos → Multi. Aplica con y sin prefijo INT_ —
  // el naming legacy ("UK_…", "IP UK…", "MADRID | …") no lo lleva y antes
  // caía en Multi por defecto (bug real, pivot de Davide).
  const countries = countryTokenSet(tokens);
  if (countries.size === 1) return { country: [...countries][0], uncertain: false };
  // ≥2 países explícitos ("UK & USA") → Multi por defecto, pero se pregunta:
  // el negocio puede querer atribuir la campaña a uno de los dos (caso real:
  // "INT_VIDEO_UK & USA_…" contaba como UK en el pivot de referencia).
  if (countries.size >= 2) return { country: "Multi", uncertain: true };
  return { country: "Multi", uncertain: !tokens.some((t) => MULTI_MARKERS.has(t)) };
}
