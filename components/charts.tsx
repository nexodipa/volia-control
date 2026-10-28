import { axisTicks, barPercent, compact, donutArcs, niceMax } from "../lib/chart-math";

// Gráficas pequeñas en SVG/CSS, sin librerías. Cada una trae su descripción para lectores de pantalla.
export type Tone = "green" | "sun" | "coral" | "blue" | "gray";

type BarItem = { label: string; value: number; display?: string; hint?: string; tone?: Tone };

/** Barras horizontales: ideal para rankings y para comparar categorías con nombres largos. */
export function BarList({ items, max, tone = "green" }: { items: BarItem[]; max?: number; tone?: Tone }) {
  const top = max ?? Math.max(0, ...items.map((i) => i.value));
  return (
    <ul className="bar-list">
      {items.map((item) => (
        <li key={item.label}>
          <div className="bar-head"><span className="bar-label">{item.label}</span><strong className="bar-value">{item.display ?? compact(item.value)}</strong></div>
          <div className="bar-track" aria-hidden="true"><i className={`tone-${item.tone ?? tone}`} style={{ width: `${barPercent(item.value, top)}%` }} /></div>
          {item.hint && <small className="bar-hint">{item.hint}</small>}
        </li>
      ))}
    </ul>
  );
}

export type Series = { name: string; tone: Tone };
type ColumnDatum = { label: string; values: number[] };

/** Columnas agrupadas (una por serie) con eje vertical. */
export function ColumnChart({ data, series, format = compact, label }: { data: ColumnDatum[]; series: Series[]; format?: (n: number) => string; label: string }) {
  const W = 640, H = 240, L = 46, R = 8, T = 10, B = 28;
  const max = niceMax(Math.max(0, ...data.flatMap((d) => d.values)));
  const ticks = axisTicks(max, 4);
  const plotW = W - L - R, plotH = H - T - B;
  const group = plotW / Math.max(1, data.length);
  const barW = Math.min(34, (group * 0.72) / Math.max(1, series.length));
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const summary = data.map((d) => `${d.label}: ${series.map((s, i) => `${s.name} ${format(d.values[i] ?? 0)}`).join(", ")}`).join("; ");
  return (
    <figure className="chart-figure">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}. ${summary}`} className="chart-svg">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="chart-axis">{format(t)}</text>
          </g>
        ))}
        {data.map((d, gi) => {
          const x0 = L + gi * group + (group - barW * series.length) / 2;
          return (
            <g key={d.label}>
              {series.map((s, si) => {
                const v = d.values[si] ?? 0;
                const h = Math.max(v > 0 ? 2 : 0, (v / max) * plotH);
                return <rect key={s.name} x={x0 + si * barW} y={T + plotH - h} width={barW - 2} height={h} rx={3} className={`chart-fill tone-${s.tone}`}><title>{`${d.label} · ${s.name}: ${format(v)}`}</title></rect>;
              })}
              <text x={L + gi * group + group / 2} y={H - 8} textAnchor="middle" className="chart-axis">{d.label}</text>
            </g>
          );
        })}
      </svg>
      {series.length > 1 && <figcaption className="viz-legend">{series.map((s) => <span key={s.name}><i className={`tone-${s.tone}`} />{s.name}</span>)}</figcaption>}
    </figure>
  );
}

/** Línea con puntos: tendencias (por ejemplo, un valor por mes). */
export function LineChart({ points, format = compact, label, tone = "green" }: { points: { label: string; value: number }[]; format?: (n: number) => string; label: string; tone?: Tone }) {
  const W = 640, H = 220, L = 46, R = 12, T = 12, B = 28;
  const max = niceMax(Math.max(0, ...points.map((p) => p.value)));
  const ticks = axisTicks(max, 4);
  const plotW = W - L - R, plotH = H - T - B;
  const x = (i: number) => L + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (v: number) => T + plotH - (v / max) * plotH;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const step = Math.ceil(points.length / 8);
  return (
    <figure className="chart-figure">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}. ${points.map((p) => `${p.label}: ${format(p.value)}`).join("; ")}`} className="chart-svg">
        {ticks.map((t) => (<g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="chart-grid" /><text x={L - 6} y={y(t) + 4} textAnchor="end" className="chart-axis">{format(t)}</text></g>))}
        {points.length > 1 && <path d={path} className={`chart-line tone-${tone}`} fill="none" />}
        {points.map((p, i) => (<g key={p.label}><circle cx={x(i)} cy={y(p.value)} r={3.5} className={`chart-fill tone-${tone}`}><title>{`${p.label}: ${format(p.value)}`}</title></circle>{i % step === 0 && <text x={x(i)} y={H - 8} textAnchor="middle" className="chart-axis">{p.label}</text>}</g>))}
      </svg>
    </figure>
  );
}

type Slice = { label: string; value: number; tone: Tone; display?: string };

/** Anillo con leyenda: reparto de un total entre pocas categorías. */
export function Donut({ slices, center, label }: { slices: Slice[]; center?: string; label: string }) {
  const arcs = donutArcs(slices.map((s) => s.value));
  const R = 52, C = 2 * Math.PI * R;
  return (
    <figure className="donut-figure">
      <svg viewBox="0 0 140 140" role="img" aria-label={`${label}. ${slices.map((s) => `${s.label}: ${s.display ?? compact(s.value)}`).join("; ")}`} className="donut-svg">
        <circle cx="70" cy="70" r={R} className="donut-bg" fill="none" />
        {slices.map((s, i) => arcs[i].fraction > 0 && (
          <circle key={s.label} cx="70" cy="70" r={R} fill="none" className={`donut-seg tone-${s.tone}`} strokeDasharray={`${arcs[i].fraction * C} ${C}`} transform={`rotate(${arcs[i].start - 90} 70 70)`}><title>{`${s.label}: ${s.display ?? compact(s.value)}`}</title></circle>
        ))}
        {center && <text x="70" y="75" textAnchor="middle" className="donut-center">{center}</text>}
      </svg>
      <figcaption className="viz-legend vertical">{slices.map((s) => <span key={s.label}><i className={`tone-${s.tone}`} />{s.label}<strong>{s.display ?? compact(s.value)}</strong></span>)}</figcaption>
    </figure>
  );
}
