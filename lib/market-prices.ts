// Precio de mercado por ítem (procesos SOCE): empareja una línea de cotización con el ítem del mercado
// y dice dónde cae el precio ofertado. Regla de emparejamiento como en vigencias (el sustantivo inicial debe
// coincidir) más una regla de medidas: si la línea trae números (ml, G, tallas), el ítem debe traer los mismos.

export type MarketItem = { item: string; unidad: string | null; n: number; entidades: number; min: number; p25: number; mediana: number; p75: number; max: number; desde: string; hasta: string };
export type MarketPriceMatch = { item: MarketItem; score: number };

const STOP = new Set(["para", "con", "sin", "unidad", "unidades", "esteril", "estéril", "tipo", "minimo", "mínimo", "hasta", "adulto", "tamaño"]);
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function words(text: string): string[] {
  return fold(text).replace(/micro\s+gotero/g, "microgotero").replace(/[^a-z0-9ñ]+/g, " ").split(" ")
    .filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d/.test(w)).map((w) => w.slice(0, 5));
}
/** Medidas significativas: números antes de la primera comilla (en el mercado, lo que sigue suele ser largo de aguja en pulgadas). */
export function measures(text: string): Set<string> {
  const head = fold(text).replace(/,(\d)/g, ".$1").split('"')[0];
  return new Set(head.match(/\d+(?:\.\d+)?/g) ?? []);
}
const subset = (a: Set<string>, b: Set<string>) => [...a].every((x) => b.has(x));

export function findMarketPrice(description: string, items: MarketItem[]): MarketPriceMatch | null {
  const list = words(description);
  if (!list.length) return null;
  const line = new Set(list), head = list[0], nums = measures(description);
  let best: MarketPriceMatch | null = null;
  for (const item of items) {
    const w = new Set(words(item.item));
    if (!w.has(head)) continue;
    const m = measures(item.item);
    if (nums.size && m.size && !subset(nums, m) && !subset(m, nums)) continue; // "Jeringa 3 ml" no es "Jeringa 10 ml"
    let shared = 0;
    for (const s of line) if (w.has(s)) shared++;
    if (shared < Math.min(2, line.size)) continue;
    const score = shared / Math.max(line.size, w.size);
    if (!best || score > best.score) best = { item, score };
  }
  return best;
}

export type PricePosition = "sin-precio" | "bajo-mercado" | "competitivo" | "sobre-mediana" | "muy-alto";
/** Dónde cae un precio unitario frente al mercado, y si el costo ya está por encima de la mediana. */
export function pricePosition(unitPrice: number, unitCost: number, item: MarketItem): { position: PricePosition; costAboveMedian: boolean } {
  const costAboveMedian = unitCost > 0 && unitCost > item.mediana;
  if (!(unitPrice > 0)) return { position: "sin-precio", costAboveMedian };
  const position: PricePosition = unitPrice < item.p25 ? "bajo-mercado" : unitPrice <= item.mediana ? "competitivo" : unitPrice <= item.p75 ? "sobre-mediana" : "muy-alto";
  return { position, costAboveMedian };
}
