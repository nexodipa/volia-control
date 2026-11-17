// Costo puesto en bodega de una importación (Ecuador): qué cuesta realmente cada unidad cuando se compra
// afuera, para compararlo con lo que hoy se paga a un distribuidor local y con lo que paga el mercado.
//
// Tributos al comercio exterior (valores por defecto, todos editables porque cambian por partida y por año):
//  - Ad valorem: % por subpartida arancelaria, sobre la base aduanera.
//  - FODINFA: 0,5 % sobre la misma base.
//  - IVA: 15 % sobre (base + ad valorem + FODINFA). Es crédito tributario si lo vendido también lleva IVA; si se
//    vende con tarifa 0 %, no se recupera y pasa a ser costo (ivaRecoverable = false).
//  - ISD: 5 % general sobre lo que se paga al exterior; hay subpartidas con 0 % (farmacéuticas) o 2,5 %.
// Base aduanera: por defecto CIF (FOB + flete + seguro). Hay criterios que excluyen el flete internacional de la
// base de los derechos arancelarios; por eso `freightInBase` se puede apagar y conviene confirmarlo con el agente
// de aduana. El valor por defecto es el que da el costo más alto, es decir, el prudente.

export type ImportSettings = {
  fodinfaPct: number;
  ivaPct: number;
  ivaRecoverable: boolean;
  isdPct: number;
  isdBase: "fob" | "cif";
  freightInBase: boolean;
  allocateBy: "value" | "weight";
};

export const DEFAULT_IMPORT_SETTINGS: ImportSettings = {
  fodinfaPct: 0.5,
  ivaPct: 15,
  ivaRecoverable: true,
  isdPct: 5,
  isdBase: "cif",
  freightInBase: true,
  allocateBy: "value",
};

export type ImportLine = {
  id: string;
  product: string;
  qty: number;
  fobUnit: number; // USD por unidad, puesto en el puerto de origen
  weightKg: number; // peso total de la línea (para repartir costos por peso)
  adValoremPct: number; // según la subpartida arancelaria
  localUnitCost: number; // lo que hoy se paga a un distribuidor local por la misma unidad (0 = no se sabe)
  salePrice: number; // precio de venta unitario esperado, sin IVA (0 = no se sabe)
};

/** Costos de la importación que se reparten entre las líneas. Todo en USD, total del embarque. */
export type ImportCosts = {
  freight: number; // flete internacional
  insurance: number; // seguro de la carga
  broker: number; // agente de aduana
  storage: number; // almacenaje y manejo en puerto
  localTransport: number; // transporte hasta la bodega
  other: number;
};

export const EMPTY_COSTS: ImportCosts = { freight: 0, insurance: 0, broker: 0, storage: 0, localTransport: 0, other: 0 };

export type LandedLine = {
  id: string;
  product: string;
  qty: number;
  fob: number;
  freight: number;
  insurance: number;
  cif: number;
  customsBase: number;
  adValorem: number;
  fodinfa: number;
  isd: number;
  iva: number;
  localExtras: number; // agente, almacenaje, transporte local y otros repartidos
  landedTotal: number; // costo puesto en bodega de toda la línea
  landedUnit: number;
  /** % que se ahorra frente a la compra local (negativo si importar sale más caro). null si no se conoce el costo local. */
  savingsPct: number | null;
  /** Margen sobre el precio de venta esperado. null si no hay precio. */
  marginPct: number | null;
};

export type LandedResult = { lines: LandedLine[]; totals: { fob: number; cif: number; taxes: number; landed: number; ivaCredit: number }; warnings: string[] };

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
const cents = (v: number) => Math.round(v * 100) / 100;
const unit = (v: number) => Math.round(v * 10000) / 10000;
const pct = (v: number) => Math.round(v * 10) / 10;

/** Reparte `amount` entre las líneas según `weights`; si todos los pesos son 0 reparte en partes iguales. */
function share(amount: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(amount > 0)) return weights.map(() => 0);
  if (total <= 0) return weights.map(() => amount / weights.length);
  return weights.map((w) => (amount * w) / total);
}

export function computeLanded(lines: ImportLine[], costsIn: Partial<ImportCosts>, settingsIn: Partial<ImportSettings> = {}): LandedResult {
  const s = { ...DEFAULT_IMPORT_SETTINGS, ...settingsIn };
  const c = { ...EMPTY_COSTS, ...costsIn };
  const warnings: string[] = [];
  const valid = lines.filter((l) => n(l.qty) > 0 && n(l.fobUnit) > 0);
  if (!valid.length) return { lines: [], totals: { fob: 0, cif: 0, taxes: 0, landed: 0, ivaCredit: 0 }, warnings };

  const fobs = valid.map((l) => n(l.qty) * n(l.fobUnit));
  const weights = valid.map((l) => n(l.weightKg));
  const useWeight = s.allocateBy === "weight" && weights.every((w) => w > 0);
  if (s.allocateBy === "weight" && !useWeight) warnings.push("Para repartir por peso hace falta el peso de todas las líneas; se repartió por valor.");
  const basis = useWeight ? weights : fobs;

  const freight = share(n(c.freight), basis);
  const insurance = share(n(c.insurance), basis);
  const extras = share(n(c.broker) + n(c.storage) + n(c.localTransport) + n(c.other), basis);

  const out: LandedLine[] = valid.map((l, i) => {
    const fob = fobs[i];
    const cif = fob + freight[i] + insurance[i];
    const customsBase = s.freightInBase ? cif : fob + insurance[i];
    const adValorem = customsBase * (n(l.adValoremPct) / 100);
    const fodinfa = customsBase * (n(s.fodinfaPct) / 100);
    const isd = (s.isdBase === "cif" ? cif : fob) * (n(s.isdPct) / 100);
    const iva = (customsBase + adValorem + fodinfa) * (n(s.ivaPct) / 100);
    const landedTotal = cif + adValorem + fodinfa + isd + extras[i] + (s.ivaRecoverable ? 0 : iva);
    const landedUnit = landedTotal / n(l.qty);
    const local = n(l.localUnitCost), price = n(l.salePrice);
    return {
      id: l.id, product: l.product, qty: n(l.qty),
      fob: cents(fob), freight: cents(freight[i]), insurance: cents(insurance[i]), cif: cents(cif), customsBase: cents(customsBase),
      adValorem: cents(adValorem), fodinfa: cents(fodinfa), isd: cents(isd), iva: cents(iva), localExtras: cents(extras[i]),
      landedTotal: cents(landedTotal), landedUnit: unit(landedUnit),
      savingsPct: local > 0 ? pct(((local - landedUnit) / local) * 100) : null,
      marginPct: price > 0 ? pct(((price - landedUnit) / price) * 100) : null,
    };
  });

  const sum = (f: (l: LandedLine) => number) => cents(out.reduce((a, l) => a + f(l), 0));
  if (s.ivaRecoverable && out.some((l) => l.iva > 0)) warnings.push("El IVA de la importación no se suma al costo porque se asume crédito tributario. Si vende con tarifa 0 %, no se recupera: desmarque «IVA recuperable».");
  return {
    lines: out,
    totals: { fob: sum((l) => l.fob), cif: sum((l) => l.cif), taxes: sum((l) => l.adValorem + l.fodinfa + l.isd + (s.ivaRecoverable ? 0 : l.iva)), landed: sum((l) => l.landedTotal), ivaCredit: s.ivaRecoverable ? sum((l) => l.iva) : 0 },
    warnings,
  };
}

/** Frase corta para la decisión por línea: ¿conviene importar frente a comprar local? */
export function importVerdict(line: Pick<LandedLine, "savingsPct" | "marginPct">): string {
  if (line.savingsPct === null) return "Sin costo local para comparar";
  if (line.savingsPct >= 10) return `Importar ahorra ${line.savingsPct} %`;
  if (line.savingsPct > 0) return `Ahorro de solo ${line.savingsPct} %: no compensa el riesgo ni el capital inmovilizado`;
  return `Importar sale ${Math.abs(line.savingsPct)} % más caro que comprar local`;
}

const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const words = (t: string) => fold(t).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 4 && !/^\d+$/.test(w));

/**
 * ¿El ítem de referencia es el mismo producto que la línea? Se pide que cada palabra significativa de la línea
 * (4 letras o más) aparezca en el nombre de la referencia, comparando por raíz de 5 letras. El emparejador de
 * precios acepta coincidencias parciales ("hoja" + "descartable"), y para decidir si conviene importar un
 * producto un precio de otro es peor que no tener precio.
 */
export function sameProduct(line: string, referenceName: string | undefined): boolean {
  if (!referenceName) return false;
  const stem = (w: string) => w.slice(0, 5);
  const ref = new Set(words(referenceName).map(stem));
  const mine = words(line).map(stem);
  return mine.length > 0 && mine.every((w) => ref.has(w));
}
