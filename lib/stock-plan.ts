// Reposición y caducidad del inventario: qué productos conviene pedir, cuánto, y qué lotes hay que mover antes de
// que venzan. Funciones puras (sin red ni base de datos) para poder probarlas.
//
// Los criterios son internos de Volia, no normas: cobertura mínima, meta de reposición y ventana de consumo se
// ajustan en las constantes de abajo. Solo cuentan como demanda las ventas y los usos en cirugía; pérdidas,
// caducidades y ajustes no.
import { daysUntil } from "./business-alerts.ts";

export type PlanItem = { id?: string; code: string; product: string; lot: string; expiry: string; stock: number; reserved: number; minimum: number; unitCost: number };
export type PlanMove = { date: string; type: string; itemId?: string; code?: string; product?: string; quantity: number };

/** Se sugiere pedir cuando lo utilizable alcanza para menos de estos días. */
export const COVER_DAYS = 30;
/** El pedido sugerido deja stock para estos días de consumo, más el mínimo. */
export const TARGET_DAYS = 60;
/** Ventana en que se mide el consumo. */
export const DEMAND_WINDOW = 90;
/** Un lote se avisa desde estos días antes de caducar. */
export const EXPIRY_WARN_DAYS = 90;

const DEMAND = new Set(["sale", "surgery"]);
const EXPIRY_MARKS = [90, 60, 30, 15, 7, 3, 0];
const MAX_LINES = 12;

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const valid = (iso: string) => /^\d{4}-\d{2}-\d{2}/.test(iso || "");
export const productKey = (code: string, product: string) => plain(code || "") || plain(product || "");

type Group = { key: string; product: string; code: string; lots: PlanItem[] };

function groupItems(items: PlanItem[]): Group[] {
  const map = new Map<string, Group>();
  for (const it of items) {
    const key = productKey(it.code, it.product);
    if (!key) continue;
    const g = map.get(key) ?? { key, product: it.product, code: it.code, lots: [] };
    g.lots.push(it);
    map.set(key, g);
  }
  return [...map.values()];
}

/** Unidades por día que salen de cada producto (ventas y cirugías), según la ventana de consumo. */
export function demandRates(items: PlanItem[], moves: PlanMove[], today: string): Map<string, number> {
  const keyById = new Map<string, string>();
  for (const it of items) if (it.id) keyById.set(it.id, productKey(it.code, it.product));
  const sums = new Map<string, { units: number; first: string }>();
  for (const m of moves) {
    if (!DEMAND.has(m.type) || !valid(m.date)) continue;
    const date = m.date.slice(0, 10);
    const age = daysUntil(today, date);
    if (age < 0 || age >= DEMAND_WINDOW) continue;
    const key = (m.itemId && keyById.get(m.itemId)) || productKey(m.code ?? "", m.product ?? "");
    if (!key) continue;
    const s = sums.get(key) ?? { units: 0, first: date };
    s.units += Math.max(0, Number(m.quantity) || 0);
    if (date < s.first) s.first = date;
    sums.set(key, s);
  }
  const rates = new Map<string, number>();
  for (const [key, s] of sums) {
    const span = Math.min(DEMAND_WINDOW, Math.max(30, daysUntil(today, s.first) + 1));
    if (s.units > 0) rates.set(key, s.units / span);
  }
  return rates;
}

const isExpired = (it: PlanItem, today: string) => valid(it.expiry) && daysUntil(it.expiry, today) < 0;
const sellable = (it: PlanItem) => Math.max(0, (Number(it.stock) || 0) - (Number(it.reserved) || 0));

export type ReorderStage = "agotado" | "bajo" | "pronto";
export type ReorderItem = { key: string; product: string; code: string; usable: number; minimum: number; rate: number; coverDays: number | null; stage: ReorderStage; suggested: number };

/** Productos a reponer. Lo vencido no cuenta como disponible. Sin mínimo ni consumo, un producto sin stock no se avisa. */
export function reorderPlan(items: PlanItem[], moves: PlanMove[], today: string): ReorderItem[] {
  const rates = demandRates(items, moves, today);
  const out: ReorderItem[] = [];
  for (const g of groupItems(items)) {
    const usable = g.lots.filter((l) => !isExpired(l, today)).reduce((s, l) => s + sellable(l), 0);
    const minimum = Math.max(0, ...g.lots.map((l) => Number(l.minimum) || 0));
    const rate = rates.get(g.key) ?? 0;
    const coverDays = rate > 0 ? usable / rate : null;
    let stage: ReorderStage | null = null;
    if (usable <= 0) { if (minimum > 0 || rate > 0) stage = "agotado"; }
    else if (usable <= minimum) stage = "bajo";
    else if (coverDays !== null && coverDays <= COVER_DAYS) stage = "pronto";
    if (!stage) continue;
    const target = rate > 0 ? Math.ceil(rate * TARGET_DAYS) + minimum : 2 * minimum;
    out.push({ key: g.key, product: g.product, code: g.code, usable, minimum, rate, coverDays, stage, suggested: Math.max(1, Math.ceil(target - usable)) });
  }
  const order: Record<ReorderStage, number> = { agotado: 0, bajo: 1, pronto: 2 };
  return out.sort((a, b) => order[a.stage] - order[b.stage] || (a.coverDays ?? 999) - (b.coverDays ?? 999) || a.product.localeCompare(b.product));
}

const num = (n: number) => (Math.round(n * 10) / 10).toLocaleString("es-EC", { maximumFractionDigits: 1 });
const usd = (n: number) => `USD ${n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const STAGE_TEXT: Record<ReorderStage, string> = { agotado: "agotado", bajo: "bajo el mínimo", pronto: "alcanza para poco tiempo" };

export function reorderLine(r: ReorderItem): string {
  const cover = r.coverDays === null ? "sin salidas en 90 días" : r.usable <= 0 ? `salían unas ${num(r.rate * 7)} u. por semana` : `alcanza para ${Math.floor(r.coverDays)} día(s) al ritmo actual`;
  return `${r.product}${r.code ? ` (${r.code})` : ""} · ${STAGE_TEXT[r.stage]} · disponible ${r.usable}, mínimo ${r.minimum} · ${cover} · pedir unas ${r.suggested} u.`;
}

/** Lista para pegar en una solicitud de compra. No se envía sola: la persona la revisa y la manda. */
export function reorderList(plan: ReorderItem[], today: string): string {
  if (!plan.length) return "";
  return [`Reposición sugerida al ${today}`, "", ...plan.map((r) => `- ${r.product}${r.code ? ` (${r.code})` : ""}: unas ${r.suggested} u. (disponible ${r.usable}, mínimo ${r.minimum}${r.coverDays === null || r.usable <= 0 ? "" : `, alcanza ${Math.floor(r.coverDays)} día(s)`})`), "", "Cantidades orientativas según el consumo reciente y el mínimo; confirme con el proveedor, el plazo de entrega y el presupuesto."].join("\n");
}

export type ExpiryItem = { item: PlanItem; days: number; units: number; value: number; surplus: number | null };

/**
 * Lotes con stock que ya vencieron o vencen dentro de la ventana de aviso. Para los que aún no vencen se estima cuántas
 * unidades sobrarían al ritmo actual, vendiendo primero lo que caduca antes (FEFO). `surplus` es null si no hay consumo.
 */
export function expiringLots(items: PlanItem[], moves: PlanMove[], today: string): ExpiryItem[] {
  const rates = demandRates(items, moves, today);
  const out: ExpiryItem[] = [];
  for (const g of groupItems(items)) {
    const rate = rates.get(g.key) ?? 0;
    const live = g.lots.filter((l) => (Number(l.stock) || 0) > 0 && valid(l.expiry)).sort((a, b) => a.expiry.localeCompare(b.expiry));
    let before = 0;
    for (const lot of live) {
      const days = daysUntil(lot.expiry, today);
      const stock = Number(lot.stock) || 0;
      const value = stock * (Number(lot.unitCost) || 0);
      if (days < 0) { out.push({ item: lot, days, units: stock, value, surplus: null }); continue; }
      const avail = sellable(lot);
      if (days <= EXPIRY_WARN_DAYS) {
        const sold = Math.min(avail, Math.max(0, rate * days - before));
        out.push({ item: lot, days, units: stock, value, surplus: rate > 0 ? Math.ceil(avail - sold) : null });
      }
      before += avail;
    }
  }
  return out.sort((a, b) => a.days - b.days);
}

export function expiryLine(e: ExpiryItem): string {
  const lot = `${e.item.product}${e.item.code ? ` (${e.item.code})` : ""} · lote ${e.item.lot || "sin número"}`;
  const qty = `${e.units} u.${e.value > 0 ? ` (${usd(e.value)} a costo)` : ""}`;
  if (e.days < 0) return `${lot} · ${qty} · vencido hace ${-e.days} día(s) · retirar de la venta y registrar como caducidad`;
  const when = e.days === 0 ? "vence hoy" : `vence el ${e.item.expiry.slice(0, 10)} (en ${e.days} día(s))`;
  const flow = e.surplus === null ? "sin salidas en 90 días" : e.surplus > 0 ? `al ritmo actual sobrarían ${num(e.surplus)} u.: darle salida primero` : "alcanza a salir al ritmo actual";
  return `${lot} · ${qty} · ${when} · ${flow}`;
}

export type StockDigest = { expiry: { total: number; value: number; lines: string[] }; reorder: { total: number; lines: string[]; agotados: number } };

const cap = (lines: string[]) => (lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), `y ${lines.length - MAX_LINES} más: están en Inventario`] : lines);

/**
 * Lunes: todo. Martes a viernes: lotes vencidos ayer y los que cumplen 90, 60, 30, 15, 7, 3 o 0 días; y los miércoles,
 * lo agotado que tenía consumo reciente.
 */
export function stockDigest(items: PlanItem[], moves: PlanMove[], today: string, full: boolean): StockDigest {
  const wednesday = new Date(`${today}T12:00:00Z`).getUTCDay() === 3;
  const lots = expiringLots(items, moves, today).filter((e) => full || e.days === -1 || EXPIRY_MARKS.includes(e.days));
  const plan = reorderPlan(items, moves, today).filter((r) => full || (wednesday && r.stage === "agotado" && r.rate > 0));
  return {
    expiry: { total: lots.length, value: lots.reduce((s, e) => s + e.value, 0), lines: cap(lots.map(expiryLine)) },
    reorder: { total: plan.length, lines: cap(plan.map(reorderLine)), agotados: plan.filter((r) => r.stage === "agotado" && r.rate > 0).length },
  };
}
