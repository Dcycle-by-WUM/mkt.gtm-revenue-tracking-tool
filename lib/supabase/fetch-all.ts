const PAGE_SIZE = 1000;

type Rangeable<T> = {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>;
};

export async function fetchAll<T>(
  buildQuery: () => Rangeable<T>,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

type CountableRangeable<T> = {
  range: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown; count: number | null }>;
};

// Igual que `fetchAll` pero trae las páginas EN PARALELO en vez de en serie.
// Para tablas grandes (p.ej. ~80k llamadas en `activities`) la versión secuencial
// hace decenas de round-trips encadenados y tarda 12-15s → la función SSR de
// Netlify se pasa de tiempo y el navegador ve "Connection closed". Aquí pedimos
// la cuenta exacta en la primera página y luego lanzamos el resto concurrentes.
//
// IMPORTANTE: la query DEBE incluir `{ count: "exact" }` en el `select` y un
// `.order(...)` por una columna ESTABLE y única (p.ej. la PK `id`), para que las
// páginas no se solapen ni se dejen filas entre peticiones separadas.
export async function fetchAllParallel<T>(
  buildQuery: () => CountableRangeable<T>,
  opts?: { pageSize?: number; concurrency?: number },
): Promise<T[]> {
  const pageSize = opts?.pageSize ?? PAGE_SIZE;
  const concurrency = opts?.concurrency ?? 8;

  const first = await buildQuery().range(0, pageSize - 1);
  if (first.error) throw first.error;
  const firstData = first.data ?? [];
  const total = first.count ?? firstData.length;
  if (total <= firstData.length) return firstData;

  const pages = Math.ceil(total / pageSize);
  const results: T[][] = new Array(pages);
  results[0] = firstData;

  let nextPage = 1;
  const worker = async (): Promise<void> => {
    for (let p = nextPage++; p < pages; p = nextPage++) {
      const { data, error } = await buildQuery().range(p * pageSize, p * pageSize + pageSize - 1);
      if (error) throw error;
      results[p] = data ?? [];
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, pages - 1) }, worker));
  return results.flat();
}
