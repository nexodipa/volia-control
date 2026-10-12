// Reglas puras (sin base de datos ni UI) para alertas de negocio.
// Dinero en centavos enteros; fechas en ISO (YYYY-MM-DD).

export type ExpiryStatus = "vencido" | "critico" | "proximo" | "vigente";

export type RegulatoryDoc = { id: number; kind: string; reference: string; expiresAt: string | null };

const DAY_MS = 86_400_000;

function toDay(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysUntil(expiresAt: string, today: string): number {
  return Math.round((toDay(expiresAt) - toDay(today)) / DAY_MS);
}

export function expiryStatus(expiresAt: string, today: string, criticalDays = 30, warnDays = 90): ExpiryStatus {
  const d = daysUntil(expiresAt, today);
  if (d < 0) return "vencido";
  if (d <= criticalDays) return "critico";
  if (d <= warnDays) return "proximo";
  return "vigente";
}

/** Documentos que requieren acción, del más urgente al menos urgente. Sin fecha = sin control, se reporta aparte. */
export function expiringDocuments(docs: RegulatoryDoc[], today: string, warnDays = 90) {
  const withDate = docs.filter((d): d is RegulatoryDoc & { expiresAt: string } => !!d.expiresAt);
  const alerts = withDate
    .map((d) => ({ ...d, days: daysUntil(d.expiresAt, today), status: expiryStatus(d.expiresAt, today, 30, warnDays) }))
    .filter((d) => d.status !== "vigente")
    .sort((a, b) => a.days - b.days);
  return { alerts, withoutDate: docs.filter((d) => !d.expiresAt) };
}

/** Margen sobre precio de venta, en puntos básicos (2500 = 25 %). */
export function marginBps(costCents: number, priceCents: number): number {
  if (priceCents <= 0) return -10_000;
  return Math.round(((priceCents - costCents) / priceCents) * 10_000);
}

export function checkMarginFloor(costCents: number, priceCents: number, floorBps: number) {
  const bps = marginBps(costCents, priceCents);
  const minPriceCents = Math.ceil(costCents / (1 - floorBps / 10_000));
  return { marginBps: bps, belowFloor: bps < floorBps, minPriceCents };
}

export type Receivable = { invoiceRef: string; customer: string; totalCents: number; issuedAt: string; paidAt?: string | null };

/** Facturas impagas con días de atraso respecto al plazo pactado. */
export function overdueReceivables(items: Receivable[], today: string, termDays = 30) {
  return items
    .filter((r) => !r.paidAt)
    .map((r) => ({ ...r, daysOverdue: -daysUntil(r.issuedAt, today) - termDays }))
    .filter((r) => r.daysOverdue > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}
