// Helpers puros de regiones — importables desde Client Components (sin
// tocar Supabase ni arrastrar dependencias). El acceso a datos vive en
// lib/data/regions.ts.

// Mismo literal que lib/country.ts / lib/mock-data.ts — duplicado a
// propósito para que este módulo no importe nada.
const NO_COUNTRY = "Sin país / Multi";

export type CountryGroups = Record<string, string>;

export const REST_OF_INTL = "Rest of International";

// Espejo de la seed de `country_groups` (migración 0015) — fallback cuando
// Supabase no está vivo.
export const DEFAULT_GROUPS: CountryGroups = {
  ES: "Spain",
  DE: "DACH", AT: "DACH", CH: "DACH",
  UK: REST_OF_INTL, FR: REST_OF_INTL, IT: REST_OF_INTL,
  US: REST_OF_INTL, MX: REST_OF_INTL, PT: REST_OF_INTL, NL: REST_OF_INTL,
};

// Nombre legible para mostrar en tablas (comparación por mes del Explorer,
// etc.) — el código ("ES", "UK"…) es el que se usa para filtrar/agrupar,
// pero en pantalla un nombre real se lee mejor. Claves fuera de este mapa
// (NO_COUNTRY, buckets "Otros · <región>", canales, campañas…) se muestran
// tal cual, sin traducir.
const COUNTRY_NAMES: Record<string, string> = {
  ES: "España", UK: "Reino Unido", DE: "Alemania", FR: "Francia", IT: "Italia",
  US: "Estados Unidos", MX: "México", PT: "Portugal", NL: "Países Bajos",
  AT: "Austria", CH: "Suiza",
};

export function countryDisplayName(code: string): string {
  return COUNTRY_NAMES[code] ?? code;
}

// Espejo JS de la función SQL normalize_country() (migración 0014): pasa el
// texto libre de país ("Spain", "España"…) al mismo código canónico que usan
// las campañas. Se aplica al LEER (fachadas lib/data/*) como cinturón de
// seguridad contra etiquetas sin normalizar que ya viven en la base
// (country_parsed de campañas/contactos, overrides antiguos) — sin esto,
// "Spain" y "ES" aparecen como dos países distintos en filtros y pivots.
const COUNTRY_LABELS: Record<string, string> = {
  es: "ES", spain: "ES", "españa": "ES", espana: "ES", espagne: "ES",
  uk: "UK", gb: "UK", "united kingdom": "UK", "great britain": "UK",
  "reino unido": "UK", england: "UK",
  de: "DE", germany: "DE", alemania: "DE", deutschland: "DE",
  fr: "FR", france: "FR", francia: "FR",
  it: "IT", italy: "IT", italia: "IT",
  us: "US", usa: "US", "united states": "US", "united states of america": "US",
  "estados unidos": "US", eeuu: "US", "ee.uu.": "US",
  mx: "MX", mexico: "MX", "méxico": "MX",
  pt: "PT", portugal: "PT",
  nl: "NL", netherlands: "NL", "paises bajos": "NL", "países bajos": "NL",
  at: "AT", austria: "AT",
  ch: "CH", switzerland: "CH", suiza: "CH", schweiz: "CH",
};

export function normalizeCountryLabel(raw: string): string {
  const t = raw.trim();
  if (!t) return NO_COUNTRY;
  return COUNTRY_LABELS[t.toLowerCase()] ?? t;
}

// Prefijo de los buckets de países SIN actividad paid, colapsados en su
// región para no llenar pivots y listados con la cola larga de orígenes
// orgánicos ("Otros · Rest of International"). regionOf lo entiende para que
// el filtro de región siga funcionando sobre filas colapsadas.
export const OTHERS_PREFIX = "Otros · ";

export function collapseCountry(country: string, groups: CountryGroups): string {
  return OTHERS_PREFIX + regionOf(country, groups);
}

// Región de un país según el mapa. Países desconocidos → Rest of
// International; el bucket "Sin país / Multi" es su propio grupo para que
// no contamine ninguna región.
export function regionOf(country: string, groups: CountryGroups): string {
  if (country === NO_COUNTRY) return NO_COUNTRY;
  if (country.startsWith(OTHERS_PREFIX)) return country.slice(OTHERS_PREFIX.length);
  return groups[country] ?? REST_OF_INTL;
}

// Regiones presentes en un conjunto de países: primero las definidas por el
// usuario (orden de aparición del mapa), Rest of International después y
// "Sin país / Multi" al final.
export function regionsOf(countries: string[], groups: CountryGroups): string[] {
  const present = new Set(countries.map((c) => regionOf(c, groups)));
  const ordered: string[] = [];
  for (const g of Object.values(groups)) {
    if (present.has(g) && !ordered.includes(g)) ordered.push(g);
  }
  if (present.has(REST_OF_INTL) && !ordered.includes(REST_OF_INTL)) ordered.push(REST_OF_INTL);
  if (present.has(NO_COUNTRY)) ordered.push(NO_COUNTRY);
  return ordered;
}
