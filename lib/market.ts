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
};

export type MarketFilter = { category?: "todas" | "trauma" | "insumos"; query?: string; onlyOurs?: boolean };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterProcesses(list: MarketProcess[], f: MarketFilter = {}) {
  const q = norm(f.query ?? "").trim();
  return list.filter((p) =>
    (!f.category || f.category === "todas" || p.c === f.category) &&
    (!f.onlyOurs || p.vb) &&
    (!q || norm(`${p.id} ${p.b} ${p.t} ${p.w}`).includes(q)));
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
