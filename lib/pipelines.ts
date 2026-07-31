// Definición de negocio de los pipelines de HubSpot que forman el "pipeline
// total de new business" — helpers puros, sin dependencias de red.
//
// OJO: esto NO es el scope inbound. El scope inbound vive en la tabla
// `pipeline_country_map` (migración 0017) y, por la decisión #12 del log
// (docs/DECISIONES.md), solo incluye AE Pipeline (→ Spain) e International
// Pipeline (→ Rest of International). Ese mapa manda qué cuenta como pipeline
// INBOUND en todas las métricas (`deal_attribution` hace INNER JOIN contra él).
//
// El "total" es otra pregunta: ¿cuánto pipeline de NEW BUSINESS abrió el
// equipo en el mes, venga de inbound o de outbound/offline? Para eso miramos
// los deals crudos de los tres pipelines de new business, sin filtrar por
// fuente. El outbound (deals con fuente OFFLINE, creados a mano por sales)
// NO tiene objetivos propios; se muestra solo para dar el vistazo general y
// el % de inbound sobre el total (petición de Davide, jul-2026).
//
// Deliberadamente FUERA del total: Renewals, DACH Renewals, Upsells &
// Cross-Sells, DACH Upsells, M&A, Consulting license, Alliance partnerships y
// CIOs & CFOs Pipe — no son new business, meterlos distorsionaría el % de
// inbound. Los IDs salen de la propiedad `pipeline` (enum) de deals en el
// portal de HubSpot.

export type TotalPipeline = {
  /** ID del pipeline en HubSpot (valor de `deals.pipeline`). */
  id: string;
  /** Etiqueta legible. */
  label: string;
  /** ¿Este pipeline está dentro del scope inbound (pipeline_country_map)? */
  inScopeInbound: boolean;
};

// Los tres pipelines de new business. AE e International coinciden con el
// scope inbound; DACH es 100% outbound hoy (no tiene objetivos y por eso la
// decisión #12 lo dejó fuera de las métricas inbound), pero sí suma al total.
export const TOTAL_PIPELINES: TotalPipeline[] = [
  { id: "7888791", label: "AE Pipeline", inScopeInbound: true },
  { id: "883841939", label: "DACH Pipeline", inScopeInbound: false },
  { id: "727373069", label: "International Pipeline", inScopeInbound: true },
];

export const TOTAL_PIPELINE_IDS: string[] = TOTAL_PIPELINES.map((p) => p.id);

export function pipelineLabelById(id: string | null): string {
  if (!id) return "Sin pipeline";
  return TOTAL_PIPELINES.find((p) => p.id === id)?.label ?? id;
}
