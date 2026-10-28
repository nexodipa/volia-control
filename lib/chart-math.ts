// Cálculos de las gráficas (sin dibujar nada), para poder probarlos.

/** Máximo "redondo" para el eje: 1, 2, 2.5, 5 o 10 por una potencia de diez. */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  const f = value / base;
  const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return step * base;
}

export function axisTicks(max: number, count = 4): number[] {
  const top = niceMax(max);
  return Array.from({ length: count + 1 }, (_, i) => (top * i) / count);
}

/** Ancho porcentual de una barra, con un mínimo visible para valores pequeños pero mayores que cero. */
export function barPercent(value: number, max: number, minVisible = 2): number {
  if (!(value > 0) || !(max > 0)) return 0;
  return Math.min(100, Math.max(minVisible, (value / max) * 100));
}

/** Etiqueta corta para ejes: 1.2 mil, 3.4 M. */
export function compact(value: number): string {
  const abs = Math.abs(value);
  const fmt = (n: number) => n.toLocaleString("es-EC", { maximumFractionDigits: n < 10 ? 1 : 0 });
  if (abs >= 1_000_000) return `${fmt(value / 1_000_000)} M`;
  if (abs >= 1_000) return `${fmt(value / 1_000)} mil`;
  return fmt(value);
}

/** Convierte valores en ángulos de un anillo (en grados, empezando arriba). Descarta lo que no suma. */
export function donutArcs(values: number[]): { start: number; end: number; fraction: number }[] {
  const total = values.reduce((s, v) => s + (v > 0 ? v : 0), 0);
  let cursor = 0;
  return values.map((v) => {
    const fraction = total > 0 && v > 0 ? v / total : 0;
    const start = cursor;
    cursor += fraction * 360;
    return { start, end: cursor, fraction };
  });
}
