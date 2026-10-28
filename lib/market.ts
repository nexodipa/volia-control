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
    (!f.buyer || p.b === f.buyer) &&
    (!f.province || provinceOf(p) === f.province) &&
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
