// Fachada de lectura de llamadas por SDR — grano owner × mes.
//
// Cuenta las actividades `kind='call'` de la tabla `activities` agrupadas por
// (owner, mes del `occurred_at`). El nombre y el estado (Active/Left) salen de
// la tabla `owners` (archived=true ≈ Left). Se agrega en TS (el cliente JS de
// Supabase no hace GROUP BY), igual que `lib/data/pipeline-totals.ts`.
//
// Las llamadas SIN owner (owner_id null) son las del dialer/integración (una
// herramienta que se desplegó ~feb-2026): NO son atribuibles a ningún SDR, así
// que van en un bucket aparte y NO cuentan en los totales por persona.

import { getSupabase } from "@/lib/supabase/client";
import { fetchAll } from "@/lib/supabase/fetch-all";

export type SdrCallsRow = {
  ownerId: string | null; // null = bucket dialer/integración (sin owner)
  name: string;
  status: "Active" | "Left";
  byMonth: Record<string, number>; // "YYYY-MM" -> nº de llamadas
  total: number;
  activeMonths: number; // meses con al menos una llamada
  avgPerActiveMonth: number;
};

export type SdrCallsData = {
  months: string[]; // union de meses con datos, orden ascendente
  reps: SdrCallsRow[]; // owner-assigned, orden descendente por total
  dialer: SdrCallsRow; // bucket sin owner (dialer/integración)
  callsByMonth: Record<string, number>; // total owner-assigned por mes
  totalOwnerAssigned: number;
  totalDialer: number;
};

type DbCall = { owner_id: string | null; occurred_at: string | null };
type DbOwner = { id: string; first_name: string | null; last_name: string | null; archived: boolean | null };

// Comerciales excluidos SIEMPRE del análisis (decisión de negocio): no cuentan
// en totales, matriz ni ratios. Comparación sin acentos y en minúsculas.
const EXCLUDED_NAMES = new Set(["lucia mosquera"]);
const norm = (s: string): string =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
const isExcluded = (name: string): boolean => EXCLUDED_NAMES.has(norm(name));

// Mock para previews sin Supabase — subconjunto ilustrativo (números tipo Excel
// `dcycle_calls_per_sdr.xlsx`). Suficiente para ver el layout de la pantalla.
const MOCK_MONTHS = ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07"];
const mockRep = (
  ownerId: string,
  name: string,
  status: "Active" | "Left",
  vals: number[],
): SdrCallsRow => {
  const byMonth: Record<string, number> = {};
  MOCK_MONTHS.forEach((m, i) => (byMonth[m] = vals[i] ?? 0));
  return finalizeRow({ ownerId, name, status, byMonth });
};

function buildMock(): SdrCallsData {
  const reps = [
    mockRep("1", "Paula Serrats", "Active", [926, 304, 752, 1075, 457]),
    mockRep("2", "Carmen Báscones", "Active", [741, 692, 762, 1025, 185]),
    mockRep("3", "Lucas Abad Revert", "Active", [799, 511, 531, 741, 286]),
    mockRep("4", "Jorge Latorre Escudero", "Active", [740, 565, 651, 733, 79]),
    mockRep("5", "Óscar Davies Bermejo", "Active", [338, 825, 654, 1063, 143]),
  ]
    .filter((r) => !isExcluded(r.name))
    .sort((a, b) => b.total - a.total);
  const dialer = finalizeRow({
    ownerId: null,
    name: "Dialer / integración (sin owner)",
    status: "Active",
    byMonth: { "2026-03": 2141, "2026-04": 4828, "2026-05": 3900, "2026-06": 4126, "2026-07": 963 },
  });
  return assemble(reps, dialer);
}
const mockSdrCalls: SdrCallsData = buildMock();

function finalizeRow(base: {
  ownerId: string | null;
  name: string;
  status: "Active" | "Left";
  byMonth: Record<string, number>;
}): SdrCallsRow {
  const values = Object.values(base.byMonth);
  const total = values.reduce((s, v) => s + v, 0);
  const activeMonths = values.filter((v) => v > 0).length;
  return {
    ...base,
    total,
    activeMonths,
    avgPerActiveMonth: activeMonths ? Math.round(total / activeMonths) : 0,
  };
}

function assemble(reps: SdrCallsRow[], dialer: SdrCallsRow): SdrCallsData {
  const monthSet = new Set<string>();
  for (const r of [...reps, dialer]) for (const m of Object.keys(r.byMonth)) monthSet.add(m);
  const months = [...monthSet].sort();
  const callsByMonth: Record<string, number> = {};
  for (const m of months) callsByMonth[m] = reps.reduce((s, r) => s + (r.byMonth[m] ?? 0), 0);
  return {
    months,
    reps,
    dialer,
    callsByMonth,
    totalOwnerAssigned: reps.reduce((s, r) => s + r.total, 0),
    totalDialer: dialer.total,
  };
}

// Estructura vacía pero válida — para cuando hay Supabase pero aún no están la
// columna `activities.owner_id` / la tabla `owners` (migración 0026 sin aplicar)
// o falla la lectura. Evita que /sdrs reviente: el bloque de pipe sí funciona.
const EMPTY: SdrCallsData = {
  months: [],
  reps: [],
  dialer: finalizeRow({ ownerId: null, name: "Dialer / integración (sin owner)", status: "Active", byMonth: {} }),
  callsByMonth: {},
  totalOwnerAssigned: 0,
  totalDialer: 0,
};

export async function listSdrCalls(): Promise<SdrCallsData> {
  const sb = getSupabase();
  if (!sb) return mockSdrCalls;

  let calls: DbCall[];
  let owners: DbOwner[];
  try {
    [calls, owners] = await Promise.all([
      fetchAll<DbCall>(() =>
        sb.from("activities").select("owner_id, occurred_at").eq("kind", "call").not("occurred_at", "is", null),
      ),
      fetchAll<DbOwner>(() => sb.from("owners").select("id, first_name, last_name, archived")),
    ]);
  } catch (e) {
    // Típicamente: migración 0026 aún no aplicada (columna/tabla inexistente).
    console.warn(`[sdr-calls] lectura falló, devuelvo vacío: ${e instanceof Error ? e.message : e}`);
    return EMPTY;
  }

  const ownerById = new Map(owners.map((o) => [o.id, o]));
  const ownerName = (o: DbOwner | undefined, id: string): string => {
    const n = [o?.first_name, o?.last_name].filter(Boolean).join(" ").trim();
    return n || id; // sin nombre resuelto, mostramos el id
  };

  // Agrega por (owner, mes). El bucket sin owner va bajo la clave "__dialer__".
  const DIALER = "__dialer__";
  const acc = new Map<string, { ownerId: string | null; byMonth: Record<string, number> }>();
  for (const c of calls) {
    if (!c.occurred_at) continue;
    const month = c.occurred_at.slice(0, 7); // YYYY-MM
    const key = c.owner_id ?? DIALER;
    const cur = acc.get(key) ?? { ownerId: c.owner_id ?? null, byMonth: {} };
    cur.byMonth[month] = (cur.byMonth[month] ?? 0) + 1;
    acc.set(key, cur);
  }

  const reps: SdrCallsRow[] = [];
  let dialer: SdrCallsRow = finalizeRow({
    ownerId: null,
    name: "Dialer / integración (sin owner)",
    status: "Active",
    byMonth: {},
  });
  for (const [key, v] of acc) {
    if (key === DIALER) {
      dialer = finalizeRow({ ...dialer, byMonth: v.byMonth });
      continue;
    }
    const o = ownerById.get(key);
    const name = ownerName(o, key);
    if (isExcluded(name)) continue; // Lucía Mosquera y demás excluidos fijos
    reps.push(
      finalizeRow({
        ownerId: key,
        name,
        status: o?.archived ? "Left" : "Active",
        byMonth: v.byMonth,
      }),
    );
  }
  reps.sort((a, b) => b.total - a.total);
  return assemble(reps, dialer);
}
