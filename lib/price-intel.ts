// Inteligencia de precios: une precio de mercado (procesos SOCE), HECAM 2026 y listas de proveedores
// para responder dos preguntas por producto: ¿a cuánto se paga en el mercado? ¿quién me lo vende más barato?
import { bestNameMatch, type MarketItem } from "./market-prices.ts";
import { findHecamItem, type HecamItem } from "./hecam.ts";

export type SupplierItem = { p: string; n: string; c?: string; l?: string; costo?: number; pvp?: number; und?: string };
export type PriceData = { market: MarketItem[]; hecam: HecamItem[]; suppliers: SupplierItem[] };
export type MarketReference = { price: number; source: "mercado" | "hecam-adjudicado" | "hecam-referencial"; detail: string };

/** Precio de referencia del mercado: mediana SOCE si existe; si no, precio adjudicado del HECAM; si no, su precio referencial. */
export function marketReference(description: string, data: PriceData): MarketReference | null {
  const m = bestNameMatch(description, data.market, (i) => i.item);
  if (m) return { price: m.value.mediana, source: "mercado", detail: `mitad del mercado en ${m.value.n} procesos` };
  const h = findHecamItem(description, data.hecam);
  if (h?.pua) return { price: h.pua, source: "hecam-adjudicado", detail: `adjudicado por el HECAM${h.g ? ` a ${h.g}` : ""}` };
  if (h?.pur) return { price: h.pur, source: "hecam-referencial", detail: "precio referencial del HECAM 2026" };
  return null;
}

/** Mejor oferta de cada proveedor para una descripción, ordenadas por precio (costo si lo hay; si no, precio de lista). */
export function supplierOffers(description: string, suppliers: SupplierItem[]) {
  const byProvider = new Map<string, SupplierItem[]>();
  for (const s of suppliers) byProvider.set(s.p, [...(byProvider.get(s.p) ?? []), s]);
  const out: { item: SupplierItem; price: number; kind: "costo" | "lista" }[] = [];
  for (const list of byProvider.values()) {
    const m = bestNameMatch(description, list, (s) => s.n);
    if (!m) continue;
    const price = m.value.costo ?? m.value.pvp;
    if (price) out.push({ item: m.value, price, kind: m.value.costo ? "costo" : "lista" });
  }
  return out.sort((a, b) => a.price - b.price);
}

/** El costo ya supera el precio de mercado: con ese proveedor no se puede ganar sin perder dinero. */
export const costAboveMarket = (unitCost: number, ref: MarketReference | null) => !!ref && unitCost > 0 && unitCost > ref.price;

let cache: Promise<PriceData> | null = null;
/** Carga una sola vez los tres archivos de precios (en el navegador). */
export function loadPriceData(): Promise<PriceData> {
  if (cache) return cache;
  const get = (url: string) => fetch(url, { cache: "force-cache" }).then((r) => (r.ok ? r.json() : { items: [] })).then((d) => d.items ?? []).catch(() => []);
  cache = Promise.all([get("/data/precios-mercado-items.json"), get("/data/hecam-2026.json"), get("/data/costos-proveedores.json")])
    .then(([market, hecam, suppliers]) => ({ market, hecam, suppliers }));
  return cache;
}
