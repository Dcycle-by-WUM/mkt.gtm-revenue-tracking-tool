// Asignación SDR → pipeline de new business para SDRs Overview.
//
// POR QUÉ EXISTE ESTO
// -------------------
// Los SDRs trabajan sobre uno de los pipelines de new business
// (lib/pipelines.ts): AE Pipeline (Spain) o DACH Pipeline. HubSpot no expone
// esa relación en las llamadas —una `activity` solo trae el owner, no el
// pipeline al que da soporte—, así que la mantenemos a mano aquí (decisión de
// negocio, Davide ago-2026). Sirve para separar la actividad de llamadas por
// pipeline en la pantalla /sdrs.
//
// Clave = nombre del SDR NORMALIZADO (sin acentos, minúsculas), igual criterio
// que la exclusión de `lib/data/sdr-calls.ts`, para que el match no dependa de
// tildes ni mayúsculas venga el nombre de la tabla `owners` o del fallback
// curado (lib/data/sdr-owner-names.ts).

export type SdrPipeline = "AE" | "DACH";

const norm = (s: string): string =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

// SDRs del AE Pipeline (Spain).
const AE_NAMES = [
  "Paula Serrats",
  "Carmen Báscones",
  "Lucas Abad Revert",
  "Jorge Latorre Escudero",
  "Gelia Pereira",
  "Álvaro Cabal García",
  "Santiago Rodríguez",
  "Óscar Davies Bermejo",
  "Sergio López del Río",
  "Carlota López-Heredia Romera",
];

// SDRs del DACH Pipeline.
const DACH_NAMES = [
  "Simon Stolpe",
  "Andreas Bode",
  "Juan Kariger",
  "Katharina Kehlbreier",
  "Valentin Aman",
];

const BY_NAME = new Map<string, SdrPipeline>();
for (const n of AE_NAMES) BY_NAME.set(norm(n), "AE");
for (const n of DACH_NAMES) BY_NAME.set(norm(n), "DACH");

// Pipeline del SDR por nombre, o null si no está asignado (p. ej. el bucket del
// dialer sin owner, o un comercial nuevo aún sin clasificar).
export function sdrPipeline(name: string): SdrPipeline | null {
  return BY_NAME.get(norm(name)) ?? null;
}

// Rótulos legibles — mismos labels que los pipelines de new business.
export const SDR_PIPELINE_LABEL: Record<SdrPipeline, string> = {
  AE: "AE Pipeline",
  DACH: "DACH Pipeline",
};
