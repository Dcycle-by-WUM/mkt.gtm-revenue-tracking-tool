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

// Región de un país según el mapa. Países desconocidos → Rest of
// International; el bucket "Sin país / Multi" es su propio grupo para que
// no contamine ninguna región.
export function regionOf(country: string, groups: CountryGroups): string {
  if (country === NO_COUNTRY) return NO_COUNTRY;
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
