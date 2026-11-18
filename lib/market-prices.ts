// Precio de mercado por ítem (procesos SOCE): empareja una línea de cotización con el ítem del mercado
// y dice dónde cae el precio ofertado. Regla de emparejamiento como en vigencias (el sustantivo inicial debe
// coincidir) más una regla de medidas: si la línea trae números (ml, G, tallas), el ítem debe traer los mismos.

export type MarketItem = { item: string; unidad: string | null; n: number; entidades: number; min: number; p25: number; mediana: number; p75: number; max: number; desde: string; hasta: string };
export type MarketPriceMatch = { item: MarketItem; score: number };

const STOP = new Set(["para", "con", "sin", "unidad", "unidades", "esteril", "estéril", "tipo", "minimo", "mínimo", "hasta", "adulto", "tamaño"]);
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function wordsOf(text: string, minLen = 4): string[] {
  return fold(text).replace(/micro\s+gotero/g, "microgotero").replace(/[^a-z0-9ñ]+/g, " ").split(" ")
    .filter((w) => w.length >= minLen && !STOP.has(w) && !/^\d/.test(w) && !["con", "del", "las", "los", "por", "una"].includes(w)).map((w) => w.slice(0, 5));
}
/** Medidas significativas: números antes de la primera comilla (en el mercado, lo que sigue suele ser largo de aguja en pulgadas). */
export function measures(text: string): Set<string> {
  const head = fold(text).replace(/,(\d)/g, ".$1").split('"')[0];
  return new Set(head.match(/\d+(?:\.\d+)?/g) ?? []);
}
const subset = (a: Set<string>, b: Set<string>) => [...a].every((x) => b.has(x));

const fullWords = (text: string) => fold(text).replace(/micro\s+gotero/g, "microgotero").split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 4 && !/\d/.test(w) && !STOP.has(w));
/** Misma palabra, tolerando solo el plural: "guante"/"guantes" sí; "super"/"superfiller" y "trans"/"transferrina" no. */
const sameWord = (a: string, b: string) => a === b || ((a.startsWith(b) || b.startsWith(a)) && Math.abs(a.length - b.length) <= 2);
/** Palabras que siguen a "con"/"c/" y a "sin"/"s/": "con trocar" frente a "sin trocar" son productos distintos. */
function withWithout(text: string) {
  const tokens = fold(text).split(/[^a-z0-9ñ]+/).filter(Boolean);
  const withW: string[] = [], withoutW: string[] = [];
  tokens.forEach((t, i) => { const next = tokens[i + 1]; if (!next || next.length < 4) return; if (t === "con" || t === "c") withW.push(next); else if (t === "sin" || t === "s") withoutW.push(next); });
  return { withW, withoutW };
}
const clash = (a: string, b: string) => {
  const x = withWithout(a), y = withWithout(b);
  const hit = (p: string[], q: string[]) => p.some((w) => q.some((v) => sameWord(w, v)));
  return hit(x.withW, y.withoutW) || hit(x.withoutW, y.withW);
};
/**
 * ¿Una descripción contiene a la otra, palabra por palabra, en cualquiera de los dos sentidos? Las palabras con
 * cifras no cuentan (las medidas las revisa `measures`) y un "con X" frente a un "sin X" es una contradicción.
 */
export function contains(a: string, b: string): boolean {
  if (clash(a, b)) return false;
  const x = fullWords(a), y = fullWords(b);
  if (!x.length || !y.length) return true; // solo medidas: no hay nada que contrastar
  const inside = (p: string[], q: string[]) => p.every((w) => q.some((v) => sameWord(w, v)));
  return inside(x, y) || inside(y, x);
}

/** Mejor coincidencia por nombre entre una descripción y una lista (misma regla para SOCE y HECAM). */
export type MatchOptions = {
  /** Exige que ambos nombres empiecen con el mismo sustantivo y cuenta siglas de 3 letras (LCP, DHS). */ strict?: boolean;
  minScore?: number;
  /**
   * Exige que una descripción contenga a la otra (todas las palabras de una están en la otra). Sin esto basta con
   * compartir dos palabras, y "guante de examinación talla S" terminaba comparado con un kit de Papanicolau que
   * trae guantes, o "tubo endotraqueal" con un "tubo intercambiador". Las palabras con cifras (12CH, 8,5MM) no
   * cuentan: las medidas ya las revisa `measures`, y cada fuente las escribe distinto (CH / Fr).
   */
  contain?: boolean;
};
export function bestNameMatch<T>(description: string, list: T[], nameOf: (x: T) => string, opts: MatchOptions = {}): { value: T; score: number } | null {
  const minLen = opts.strict ? 3 : 4;
  const words = (t: string) => wordsOf(t, minLen);
  const lw = words(description);
  if (!lw.length) return null;
  const line = new Set(lw), head = lw[0], nums = measures(description);
  let best: { value: T; score: number } | null = null;
  for (const value of list) {
    const name = nameOf(value);
    const wl = words(name);
    const w = new Set(wl);
    if (!w.has(head)) continue;
    if (opts.strict && wl[0] !== head) continue; // "Placa LCP" no es "Sistema de placa LCP para fémur"
    const m = measures(name);
    if (nums.size && m.size && !subset(nums, m) && !subset(m, nums)) continue; // "Jeringa 3 ml" no es "Jeringa 10 ml"
    let shared = 0;
    for (const s of line) if (w.has(s)) shared++;
    if (shared < Math.min(2, line.size)) continue;
    if (opts.contain && !contains(description, name)) continue;
    const score = shared / Math.max(line.size, w.size);
    if (score < (opts.minScore ?? 0)) continue;
    if (!best || score > best.score) best = { value, score };
  }
  return best;
}

export function findMarketPrice(description: string, items: MarketItem[]): MarketPriceMatch | null {
  const m = bestNameMatch(description, items, (i) => i.item, { contain: true });
  return m ? { item: m.value, score: m.score } : null;
}

export type PricePosition = "sin-precio" | "bajo-mercado" | "competitivo" | "sobre-mediana" | "muy-alto";
/** Dónde cae un precio unitario frente al mercado, y si el costo ya está por encima de la mediana. */
export function pricePosition(unitPrice: number, unitCost: number, item: MarketItem): { position: PricePosition; costAboveMedian: boolean } {
  const costAboveMedian = unitCost > 0 && unitCost > item.mediana;
  if (!(unitPrice > 0)) return { position: "sin-precio", costAboveMedian };
  const position: PricePosition = unitPrice < item.p25 ? "bajo-mercado" : unitPrice <= item.mediana ? "competitivo" : unitPrice <= item.p75 ? "sobre-mediana" : "muy-alto";
  return { position, costAboveMedian };
}
