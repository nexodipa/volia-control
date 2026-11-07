// Inteligencia de mercado a partir de los procesos SERCOP resumidos (public/data/mercado-sercop-*.json).
// Montos en USD tal como los publica SERCOP: pueden excluir IVA o sumar varios lotes.

export type MarketProcess = {
  id: string; // código del proceso sin el prefijo OCDS
  d: string; // fecha de publicación del registro
  b: string; // entidad compradora
  m: "SIE" | "LIC" | "CAT" | "BSU" | "OTRO"; // método
  s: string; // estado
  c: "trauma" | "insumos";
  t: string; // descripción
  p: number | null; // presupuesto referencial
  o: number; // número de oferentes
  w: string; // ganadores separados por " / "
  a: number | null; // monto adjudicado
  vb: boolean; // Volia ofertó
  vw: boolean; // Volia ganó
  r?: string; // provincia del comprador, tal como la publica la fuente (si la trae)
};

export type MarketFilter = {
  category?: "todas" | "trauma" | "insumos";
  query?: string;
  onlyOurs?: boolean;
  minAmount?: number; // USD; compara con el monto adjudicado y, si no hay, con el presupuesto referencial
  buyer?: string; // entidad compradora exacta (hospital)
  province?: string;
  winner?: string; // proveedor ganador exacto
  maxAmount?: number; // USD; deja fuera los procesos sin monto conocido
  minTenderers?: number;
  maxTenderers?: number; // deja fuera los que no informan oferentes
  methods?: MarketProcess["m"][];
  provinces?: string[]; // varias provincias a la vez (se suma a `province`)
  awarded?: "si" | "no"; // con o sin monto adjudicado
  since?: string; // AAAA-MM-DD, solo procesos publicados desde ese día
  from?: string; // AAAA-MM, mes de publicación
  to?: string;
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Ciudad o cantón que aparece en el nombre del comprador → provincia. Solo se usa cuando la fuente no trae provincia.
const CITY_PROVINCE: [string, string][] = [
  ["quito", "Pichincha"], ["pichincha", "Pichincha"], ["guayaquil", "Guayas"], ["guayas", "Guayas"], ["cuenca", "Azuay"], ["azuay", "Azuay"],
  ["ambato", "Tungurahua"], ["tungurahua", "Tungurahua"], ["loja", "Loja"], ["manta", "Manabí"], ["portoviejo", "Manabí"], ["manabi", "Manabí"],
  ["riobamba", "Chimborazo"], ["chimborazo", "Chimborazo"], ["ibarra", "Imbabura"], ["imbabura", "Imbabura"], ["machala", "El Oro"], ["el oro", "El Oro"],
  ["esmeraldas", "Esmeraldas"], ["latacunga", "Cotopaxi"], ["cotopaxi", "Cotopaxi"], ["santo domingo", "Santo Domingo de los Tsáchilas"],
  ["babahoyo", "Los Ríos"], ["quevedo", "Los Ríos"], ["los rios", "Los Ríos"], ["tulcan", "Carchi"], ["carchi", "Carchi"], ["guaranda", "Bolívar"], ["bolivar", "Bolívar"],
  ["azogues", "Cañar"], ["canar", "Cañar"], ["puyo", "Pastaza"], ["pastaza", "Pastaza"], ["tena", "Napo"], ["napo", "Napo"], ["macas", "Morona Santiago"],
  ["morona", "Morona Santiago"], ["zamora", "Zamora Chinchipe"], ["lago agrio", "Sucumbíos"], ["sucumbios", "Sucumbíos"], ["orellana", "Orellana"],
  ["santa elena", "Santa Elena"], ["galapagos", "Galápagos"],
];

// Hospitales muy conocidos cuyo nombre no menciona la ciudad. Solo entran los que tienen una sola sede y provincia segura.
const KNOWN_BUYER_PROVINCE: [string, string][] = [
  ["carlos andrade marin", "Pichincha"], ["eugenio espejo", "Pichincha"], ["enrique garces", "Pichincha"], ["pablo arturo suarez", "Pichincha"],
  ["baca ortiz", "Pichincha"], ["luz elena arismendi", "Pichincha"], ["fuerzas armadas no. 1", "Pichincha"], ["fuerzas armadas no 1", "Pichincha"],
  ["teodoro maldonado", "Guayas"], ["guasmo sur", "Guayas"], ["efren jurado", "Guayas"], ["abel gilbert", "Guayas"], ["luis vernaza", "Guayas"],
  ["roberto gilbert", "Guayas"], ["icaza bustamante", "Guayas"], ["homero castanier", "Cañar"], ["manuel ygnacio monteros", "Loja"],
  ["isidro ayora", "Loja"], ["milagro", "Guayas"], ["vicente corral moscoso", "Azuay"], ["teofilo davila", "El Oro"], ["mariana de jesus", "Guayas"], ["verdi cevallos", "Manabí"], ["rafael rodriguez zambrano", "Manabí"],
  ["samborondon", "Guayas"], ["hospital basico ancon", "Santa Elena"], ["la libertad", "Santa Elena"], ["la concordia", "Santo Domingo de los Tsáchilas"],
  ["gustavo dominguez", "Santo Domingo de los Tsáchilas"], ["cosme rennella", "Cotopaxi"],
];

/** Provincia del proceso: la de la fuente si existe; si no, la deducida del nombre del comprador; si no, "". */
export function provinceOf(p: MarketProcess): string {
  if (p.r) {
    const r = norm(p.r).trim();
    const known = CITY_PROVINCE.find(([, v]) => norm(v) === r);
    return known ? known[1] : p.r.trim().toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  }
  const b = norm(p.b);
  for (const [k, v] of KNOWN_BUYER_PROVINCE) if (b.includes(k)) return v;
  for (const [k, v] of CITY_PROVINCE) if (new RegExp(`(^|[^a-z])${k}([^a-z]|$)`).test(b)) return v;
  return "";
}

export const amountOf = (p: MarketProcess) => p.a ?? p.p ?? 0;

export function filterProcesses(list: MarketProcess[], f: MarketFilter = {}) {
  const q = norm(f.query ?? "").trim();
  return list.filter((p) =>
    (!f.category || f.category === "todas" || p.c === f.category) &&
    (!f.onlyOurs || p.vb) &&
    (!f.minAmount || amountOf(p) >= f.minAmount) &&
    (!f.maxAmount || (amountOf(p) > 0 && amountOf(p) <= f.maxAmount)) &&
    (!f.minTenderers || p.o >= f.minTenderers) &&
    (!f.maxTenderers || (p.o > 0 && p.o <= f.maxTenderers)) &&
    (!f.methods?.length || f.methods.includes(p.m)) &&
    (!f.awarded || (f.awarded === "si") === (p.a != null && p.a > 0)) &&
    (!f.since || p.d >= f.since) &&
    (!f.from || p.d.slice(0, 7) >= f.from) &&
    (!f.to || p.d.slice(0, 7) <= f.to) &&
    (!f.buyer || p.b === f.buyer) &&
    (!f.province || provinceOf(p) === f.province) &&
    (!f.provinces?.length || f.provinces.includes(provinceOf(p))) &&
    (!f.winner || winnersOf(p).includes(f.winner)) &&
    (!q || norm(`${p.id} ${p.b} ${p.t} ${p.w}`).includes(q)));
}

/** Provincias presentes con cuántos procesos tiene cada una (ordenadas por cantidad). */
export function provinceCounts(list: MarketProcess[]) {
  const m = new Map<string, number>();
  for (const p of list) { const k = provinceOf(p); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
}

/** Compradores (hospitales y otras entidades) con su número de procesos, para el selector. */
export function buyerOptions(list: MarketProcess[]) {
  const m = new Map<string, number>();
  for (const p of list) m.set(p.b, (m.get(p.b) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, count]) => ({ name, count }));
}

const winnersOf = (p: MarketProcess) => p.w.split(" / ").map((x) => x.trim()).filter(Boolean);

export function winnerRanking(list: MarketProcess[], limit = 10) {
  const map = new Map<string, { name: string; wins: number; amount: number }>();
  for (const p of list) {
    const ws = winnersOf(p);
    for (const name of ws) {
      const e = map.get(name) ?? { name, wins: 0, amount: 0 };
      e.wins++;
      e.amount += (p.a ?? 0) / ws.length; // reparto simple si hay varios ganadores
      map.set(name, e);
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, limit).map((e) => ({ ...e, amount: Math.round(e.amount * 100) / 100 }));
}

export function buyerRanking(list: MarketProcess[], limit = 10) {
  const map = new Map<string, { buyer: string; processes: number; awarded: number; tenderers: number; withTenderers: number }>();
  for (const p of list) {
    const e = map.get(p.b) ?? { buyer: p.b, processes: 0, awarded: 0, tenderers: 0, withTenderers: 0 };
    e.processes++;
    e.awarded += p.a ?? 0;
    if (p.o > 0) { e.tenderers += p.o; e.withTenderers++; }
    map.set(p.b, e);
  }
  return [...map.values()]
    .sort((a, b) => b.processes - a.processes)
    .slice(0, limit)
    .map((e) => ({ buyer: e.buyer, processes: e.processes, awarded: Math.round(e.awarded * 100) / 100, avgTenderers: e.withTenderers ? Math.round((e.tenderers / e.withTenderers) * 10) / 10 : null }));
}

export function ourRecord(list: MarketProcess[]) {
  const bids = list.filter((p) => p.vb);
  const won = bids.filter((p) => p.vw);
  const decided = bids.filter((p) => !p.vw && winnersOf(p).length > 0);
  const pending = bids.filter((p) => !p.vw && winnersOf(p).length === 0);
  const lostTo = new Map<string, number>();
  for (const p of decided) for (const w of winnersOf(p)) lostTo.set(w, (lostTo.get(w) ?? 0) + 1);
  const resolved = won.length + decided.length;
  return {
    bids: bids.length,
    won: won.length,
    lost: decided.length,
    pending: pending.length,
    winRate: resolved ? Math.round((won.length / resolved) * 1000) / 10 : null,
    wonAmount: Math.round(won.reduce((s, p) => s + (p.a ?? 0), 0) * 100) / 100,
    lostAmount: Math.round(decided.reduce((s, p) => s + (p.a ?? 0), 0) * 100) / 100,
    lostTo: [...lostTo.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
  };
}

/**
 * Compara una cotización con lo que el mercado adjudicó en un proceso comparable.
 * Todo en centavos. gapPct > 0 significa que nuestro precio está por encima del adjudicado.
 */
export function compareWithAward(costCents: number, priceCents: number, awardCents: number) {
  const gapPct = awardCents > 0 ? Math.round(((priceCents - awardCents) / awardCents) * 1000) / 10 : null;
  const awardOverCostPct = costCents > 0 ? Math.round(((awardCents - costCents) / costCents) * 1000) / 10 : null;
  return {
    gapPct,
    awardOverCostPct, // cuánto margen sobre nuestro costo habría dejado el precio ganador
    belowOurCost: awardCents < costCents,
    verdict: awardCents < costCents ? "El ganador cotizó por debajo de nuestro costo." :
      gapPct !== null && gapPct > 15 ? "Nuestro precio está muy por encima del adjudicado." :
      gapPct !== null && gapPct > 0 ? "Nuestro precio está algo por encima del adjudicado." :
      "Nuestro precio es competitivo frente al adjudicado.",
  };
}

/** Perfil de una entidad compradora (búsqueda por nombre, sin tildes). Null si la búsqueda es muy corta o no hay coincidencias. */
export function buyerProfile(list: MarketProcess[], buyerQuery: string) {
  const q = norm(buyerQuery).replace(/\s+/g, " ").trim();
  if (q.length < 4) return null;
  const terms = q.split(" ").filter((t) => t.length > 2);
  const matches = list.filter((p) => { const b = norm(p.b); return terms.every((t) => b.includes(t)); });
  if (!matches.length) return null;
  const withT = matches.filter((p) => p.o > 0);
  return {
    buyers: [...new Set(matches.map((p) => p.b))],
    processes: matches.length,
    avgTenderers: withT.length ? Math.round((withT.reduce((s, p) => s + p.o, 0) / withT.length) * 10) / 10 : null,
    topWinners: winnerRanking(matches, 3),
    ourBids: matches.filter((p) => p.vb).length,
    ourWins: matches.filter((p) => p.vw).length,
  };
}

/** Advertencia de precio: margen alto frente a competencia fuerte. Umbrales conservadores, ajustables. */
export function pricingRisk(marginPct: number, avgTenderers: number | null) {
  if (avgTenderers === null || marginPct <= 0) return null;
  if (avgTenderers >= 3 && marginPct >= 40) return { level: "alto" as const, message: `Con ${avgTenderers} oferentes promedio, un margen de ${marginPct.toFixed(1)} % tiene alto riesgo de perder la subasta.` };
  if (avgTenderers >= 3 && marginPct >= 30) return { level: "medio" as const, message: `Con ${avgTenderers} oferentes promedio, un margen de ${marginPct.toFixed(1)} % deja poco espacio en la puja.` };
  return null;
}

const MONTH_NAMES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Procesos y monto adjudicado por mes (según la fecha del proceso), en orden cronológico y solo con meses que tienen datos. */
export function monthlyTotals(list: MarketProcess[]) {
  const byMonth = new Map<string, { count: number; amount: number }>();
  for (const p of list) {
    const key = /^\d{4}-\d{2}/.test(p.d) ? p.d.slice(0, 7) : "";
    if (!key) continue;
    const cur = byMonth.get(key) ?? { count: 0, amount: 0 };
    cur.count += 1; cur.amount += p.a ?? 0;
    byMonth.set(key, cur);
  }
  return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, label: MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month, ...v }));
}

/** Cuántos procesos tuvieron 1, 2, 3 a 5 o 6 o más oferentes (ignora los que no informan oferentes). */
export function competitionBuckets(list: MarketProcess[]) {
  const buckets = [{ label: "1 oferente", count: 0 }, { label: "2 oferentes", count: 0 }, { label: "3 a 5 oferentes", count: 0 }, { label: "6 o más", count: 0 }];
  for (const p of list) {
    if (!(p.o > 0)) continue;
    buckets[p.o === 1 ? 0 : p.o === 2 ? 1 : p.o <= 5 ? 2 : 3].count += 1;
  }
  return buckets;
}

/** Provincias con más monto adjudicado; lo que no tiene provincia conocida no entra. */
export function provinceTotals(list: MarketProcess[], limit = 8) {
  const byProvince = new Map<string, { count: number; amount: number }>();
  for (const p of list) {
    const name = provinceOf(p);
    if (!name) continue;
    const cur = byProvince.get(name) ?? { count: 0, amount: 0 };
    cur.count += 1; cur.amount += p.a ?? 0;
    byProvince.set(name, cur);
  }
  return [...byProvince.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.amount - a.amount || b.count - a.count).slice(0, limit);
}

export type FacetKey = "province" | "buyer" | "method" | "category";

/**
 * Opciones de un filtro con cuántos procesos habría si las eliges, respetando todos los demás filtros.
 * Así el selector de hospitales solo muestra los de la provincia elegida y los conteos no mienten.
 */
export function facetOptions(list: MarketProcess[], f: MarketFilter, key: FacetKey) {
  const rest: MarketFilter = { ...f };
  if (key === "province") { rest.province = undefined; rest.provinces = undefined; }
  if (key === "buyer") rest.buyer = undefined;
  if (key === "method") rest.methods = undefined;
  if (key === "category") rest.category = "todas";
  const counts = new Map<string, number>();
  for (const p of filterProcesses(list, rest)) {
    const name = key === "province" ? provinceOf(p) : key === "buyer" ? p.b : key === "method" ? p.m : p.c;
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"));
}

const quantile = (sorted: number[], q: number) => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

export type VoliaProfile = {
  bids: number;
  methods: MarketProcess["m"][];
  provinces: { name: string; bids: number }[];
  categories: { name: "trauma" | "insumos"; bids: number }[];
  amountLow: number; // primer cuartil de los montos de los procesos donde ofertamos, redondeado a miles
  amountHigh: number; // tercer cuartil
  medianTenderers: number | null;
};

/** Cómo es lo que Volia suele ofertar, a partir de los procesos donde participó. Null si aún no hay participaciones. */
export function voliaProfile(list: MarketProcess[]): VoliaProfile | null {
  const bids = list.filter((p) => p.vb);
  if (!bids.length) return null;
  const tally = <T extends string>(values: T[]) => { const m = new Map<T, number>(); for (const v of values) m.set(v, (m.get(v) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const amounts = bids.map(amountOf).filter((a) => a > 0).sort((a, b) => a - b);
  const tenderers = bids.map((p) => p.o).filter((o) => o > 0).sort((a, b) => a - b);
  const provinces = tally(bids.map(provinceOf).filter(Boolean));
  return {
    bids: bids.length,
    methods: tally(bids.map((p) => p.m)).map(([m]) => m),
    provinces: provinces.map(([name, n]) => ({ name, bids: n })),
    categories: tally(bids.map((p) => p.c)).map(([name, n]) => ({ name, bids: n })),
    amountLow: amounts.length ? Math.floor(quantile(amounts, 0.25) / 1000) * 1000 : 0,
    amountHigh: amounts.length ? Math.ceil(quantile(amounts, 0.75) / 1000) * 1000 : 0,
    medianTenderers: tenderers.length ? quantile(tenderers, 0.5) : null,
  };
}

/** Filtro que describe «lo que solemos ofertar»: mismos métodos, provincias donde ya ofertamos más de una vez y el rango central de montos. */
export function usualSegment(profile: VoliaProfile): MarketFilter {
  const repeat = profile.provinces.filter((p) => p.bids >= 2).map((p) => p.name);
  return {
    category: "todas",
    methods: profile.methods,
    provinces: repeat.length ? repeat : profile.provinces.slice(0, 1).map((p) => p.name),
    minAmount: profile.amountLow || undefined,
    maxAmount: profile.amountHigh || undefined,
  };
}

export type SortKey = "monto" | "fecha" | "oferentes";

export function sortProcesses(list: MarketProcess[], by: SortKey) {
  const out = [...list];
  if (by === "fecha") return out.sort((a, b) => b.d.localeCompare(a.d));
  if (by === "oferentes") return out.sort((a, b) => b.o - a.o || amountOf(b) - amountOf(a));
  return out.sort((a, b) => amountOf(b) - amountOf(a));
}

/** Filtros activos como etiquetas legibles (para mostrarlos como chips que se pueden quitar uno a uno). */
export function activeFilters(f: MarketFilter): { key: string; label: string }[] {
  const money = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)} M` : n >= 1000 ? `$${Math.round(n / 1000)} mil` : `$${n}`);
  const out: { key: string; label: string }[] = [];
  if (f.category && f.category !== "todas") out.push({ key: "category", label: f.category === "trauma" ? "Traumatología" : "Insumos y dispositivos" });
  if (f.methods?.length) out.push({ key: "methods", label: f.methods.join(" + ") });
  const provs = [...(f.province ? [f.province] : []), ...(f.provinces ?? [])];
  if (provs.length) out.push({ key: "provinces", label: provs.join(", ") });
  if (f.buyer) out.push({ key: "buyer", label: f.buyer.length > 36 ? `${f.buyer.slice(0, 34)}…` : f.buyer });
  if (f.winner) out.push({ key: "winner", label: `Ganó ${f.winner.length > 28 ? `${f.winner.slice(0, 26)}…` : f.winner}` });
  if (f.minAmount || f.maxAmount) out.push({ key: "amount", label: f.minAmount && f.maxAmount ? `${money(f.minAmount)} a ${money(f.maxAmount)}` : f.minAmount ? `Desde ${money(f.minAmount)}` : `Hasta ${money(f.maxAmount as number)}` });
  if (f.minTenderers || f.maxTenderers) out.push({ key: "tenderers", label: f.minTenderers && f.maxTenderers ? `${f.minTenderers} a ${f.maxTenderers} oferentes` : f.minTenderers ? `${f.minTenderers} o más oferentes` : `Hasta ${f.maxTenderers} oferentes` });
  if (f.awarded) out.push({ key: "awarded", label: f.awarded === "si" ? "Adjudicados" : "Sin adjudicar" });
  if (f.since) out.push({ key: "since", label: `desde el ${f.since}` });
  if (f.from || f.to) out.push({ key: "period", label: `${f.from ?? "…"} a ${f.to ?? "…"}` });
  if (f.query?.trim()) out.push({ key: "query", label: `«${f.query.trim()}»` });
  if (f.onlyOurs) out.push({ key: "onlyOurs", label: "Donde ofertó Volia" });
  return out;
}

/** Quita del filtro el grupo que corresponde a una etiqueta activa. */
export function clearFilterKey(f: MarketFilter, key: string): MarketFilter {
  const n: MarketFilter = { ...f };
  if (key === "category") n.category = "todas";
  if (key === "methods") n.methods = undefined;
  if (key === "provinces") { n.province = undefined; n.provinces = undefined; }
  if (key === "buyer") n.buyer = undefined;
  if (key === "winner") n.winner = undefined;
  if (key === "amount") { n.minAmount = undefined; n.maxAmount = undefined; }
  if (key === "tenderers") { n.minTenderers = undefined; n.maxTenderers = undefined; }
  if (key === "awarded") n.awarded = undefined;
  if (key === "period") { n.from = undefined; n.to = undefined; }
  if (key === "since") n.since = undefined;
  if (key === "query") n.query = "";
  if (key === "onlyOurs") n.onlyOurs = false;
  return n;
}


/** Lee un monto en dólares escrito a mano ("28.000", "1.500,50", "1500.5"). Solo importan los dólares enteros. */
export function parseAmount(text: string): number | undefined {
  const t = text.trim().replace(/[^\d.,]/g, "");
  const dec = t.match(/[.,](\d{1,2})$/); // separador decimal: coma o punto seguidos de 1 o 2 dígitos al final
  const whole = (dec ? t.slice(0, t.length - dec[0].length) : t).replace(/[^\d]/g, "");
  const n = Number(whole);
  return n > 0 ? n : undefined;
}

/** Agrega o quita un valor de una lista de selección múltiple; devuelve undefined si queda vacía. */
export function toggleIn<T>(list: T[] | undefined, value: T): T[] | undefined {
  const cur = list ?? [];
  const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
  return next.length ? next : undefined;
}

/** Mantiene coherente el rango de meses: si el mes que se acaba de mover deja el rango al revés, arrastra al otro. */
export function fixMonthRange(from: string | undefined, to: string | undefined, moved: "from" | "to") {
  if (from && to && from > to) return moved === "from" ? { from, to: from } : { from: to, to };
  return { from, to };
}

export type FreshOpportunities = { count: number; total: number; since: string; top: MarketProcess[] };

/** Procesos publicados en los últimos `days` días de los datos que encajan con lo que Volia suele ofertar. */
export function freshOpportunities(all: MarketProcess[], days = 21): FreshOpportunities | null {
  const profile = voliaProfile(all);
  if (!profile || !all.length) return null;
  const latest = all.reduce((m, p) => (p.d > m ? p.d : m), "");
  const limit = new Date(`${latest}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() - days);
  const since = limit.toISOString().slice(0, 10);
  const recent = all.filter((p) => p.d >= since);
  const fits = filterProcesses(recent, { ...usualSegment(profile), query: "", onlyOurs: false });
  return { count: fits.length, total: recent.length, since, top: sortProcesses(fits, "monto").slice(0, 3) };
}
