// Cifras para las gráficas de Inventario. Funciones puras: reciben los productos y la fecha de hoy.
export type StatItem = { product: string; expiry: string; stock: number; reserved: number; minimum: number; unitCost: number };

const SHORT_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const dayDiff = (iso: string, today: string) => Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
const valid = (iso: string) => /^\d{4}-\d{2}-\d{2}$/.test(iso);

/** Valor a costo (y unidades) que caduca en cada uno de los próximos `months` meses, más lo que ya está vencido. */
export function expiryByMonth(items: StatItem[], today: string, months = 12) {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)) - 1;
  const buckets = Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(y, m + i, 1));
    return { key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, label: SHORT_MONTHS[d.getUTCMonth()], value: 0, units: 0 };
  });
  const expired = { value: 0, units: 0 };
  for (const it of items) {
    if (!(it.stock > 0) || !valid(it.expiry)) continue;
    const value = it.stock * (it.unitCost || 0);
    if (dayDiff(it.expiry, today) < 0) { expired.value += value; expired.units += it.stock; continue; }
    const b = buckets.find((x) => it.expiry.startsWith(x.key));
    if (b) { b.value += value; b.units += it.stock; }
  }
  return { months: buckets, expired };
}

export type StockHealth = { vencido: number; porVencer: number; bajoMinimo: number; ok: number };

/** Cuántos productos/lotes caen en cada estado, sin contar dos veces: vencido, por vencer (90 días), bajo mínimo, bien. */
export function stockHealth(items: StatItem[], today: string): StockHealth {
  const out: StockHealth = { vencido: 0, porVencer: 0, bajoMinimo: 0, ok: 0 };
  for (const it of items) {
    const d = valid(it.expiry) ? dayDiff(it.expiry, today) : Infinity;
    if (it.stock > 0 && d < 0) out.vencido += 1;
    else if (it.stock > 0 && d <= 90) out.porVencer += 1;
    else if (it.stock - it.reserved <= it.minimum) out.bajoMinimo += 1;
    else out.ok += 1;
  }
  return out;
}
