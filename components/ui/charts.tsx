"use client";

// Gráficos ligeros on-brand (SVG, sin dependencias). Usan los tokens --chart-*
// y la tipografía Inter heredada. Responsive vía viewBox + width 100%.

type Serie = { label: string; color: string; values: number[] };

// Barras verticales agrupadas: comparar dos (o más) series por categoría
// (p. ej. Objetivo vs Real por mes). Con eje Y implícito (líneas guía) + leyenda.
export function GroupedBars({
  categories,
  series,
  formatValue = (v) => String(v),
  height = 240,
}: {
  categories: string[];
  series: Serie[];
  formatValue?: (v: number) => string;
  height?: number;
}) {
  const W = 720;
  const H = height;
  const padL = 46; // canaleta reservada para las etiquetas del eje Y (evita solape)
  const padR = 8;
  const padB = 28;
  const padT = 12;
  const plotW = W - padL - padR;
  const plotH = H - padB - padT;

  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const nCat = categories.length || 1;
  const groupW = plotW / nCat;
  const barGap = 6;
  const nSer = series.length || 1;
  const barW = Math.max(6, (groupW * 0.62 - barGap * (nSer - 1)) / nSer);

  const gridLines = 4;
  // Etiquetas del eje compactas (315k, 1,2M) para que no se solapen.
  const axisLabel = (v: number) => {
    if (v >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace(".", ",")}M`;
    if (v >= 1e3) return `${Math.round(v / 1e3)}k`;
    return String(Math.round(v));
  };

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" role="img">
        {/* líneas guía + etiquetas del eje Y (canaleta izquierda, centradas en la línea) */}
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const y = padT + (plotH / gridLines) * i;
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--border)" strokeWidth={1} />
              <text x={padL - 6} y={y} fontSize={10} fill="var(--faint)" textAnchor="end" dominantBaseline="middle">
                {axisLabel(Math.round(max * (1 - i / gridLines)))}
              </text>
            </g>
          );
        })}
        {/* barras */}
        {categories.map((cat, ci) => {
          const gx = padL + groupW * ci + groupW * 0.19;
          return (
            <g key={cat}>
              {series.map((s, si) => {
                const v = s.values[ci] ?? 0;
                const h = (v / max) * plotH;
                const x = gx + si * (barW + barGap);
                const y = padT + plotH - h;
                return (
                  <rect key={s.label} x={x} y={y} width={barW} height={Math.max(h, 1)} rx={3} fill={s.color}>
                    <title>{`${cat} · ${s.label}: ${formatValue(v)}`}</title>
                  </rect>
                );
              })}
              <text x={padL + groupW * ci + groupW / 2} y={H - 8} fontSize={11} fill="var(--muted)" textAnchor="middle">
                {cat}
              </text>
            </g>
          );
        })}
      </svg>
      <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
    </div>
  );
}

// Dona de reparto (share). Segmentos + leyenda con valores.
// `showLegend=false` deja solo la dona (para poner una leyenda propia al lado,
// p. ej. con un valor secundario). `centerLabel` cambia el rótulo del centro.
export function Donut({
  data,
  formatValue = (v) => String(v),
  size = 168,
  showLegend = true,
  centerLabel = "Total",
}: {
  data: { label: string; value: number; color: string }[];
  formatValue?: (v: number) => string;
  size?: number;
  showLegend?: boolean;
  centerLabel?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2;
  const stroke = size * 0.16;
  const rr = r - stroke / 2;
  const c = 2 * Math.PI * rr;
  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <g transform={`rotate(-90 ${r} ${r})`}>
          <circle cx={r} cy={r} r={rr} fill="none" stroke="var(--subtle)" strokeWidth={stroke} />
          {total > 0 &&
            data.map((d) => {
              const frac = d.value / total;
              const len = frac * c;
              const el = (
                <circle
                  key={d.label}
                  cx={r}
                  cy={r}
                  r={rr}
                  fill="none"
                  stroke={d.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${len} ${c - len}`}
                  strokeDashoffset={-offset}
                >
                  <title>{`${d.label}: ${formatValue(d.value)}`}</title>
                </circle>
              );
              offset += len;
              return el;
            })}
        </g>
        <text x={r} y={r - 4} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--text)">
          {formatValue(total)}
        </text>
        <text x={r} y={r + 14} textAnchor="middle" fontSize={10} fill="var(--muted)">
          {centerLabel}
        </text>
      </svg>
      {showLegend && (
        <ul className="space-y-1.5 text-sm">
          {data.map((d) => (
            <li key={d.label} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color }} />
              <span className="text-[var(--text-secondary)]">{d.label}</span>
              <span className="tabular-nums text-[var(--muted)]">
                {formatValue(d.value)}
                {total > 0 && <span className="text-[var(--faint)]"> · {Math.round((d.value / total) * 100)}%</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-4">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)]">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}
