// Oportunidades de mercado: procesos recientes del SERCOP ordenados por qué tanto conviene a Volia, con la razón en palabras.
// Funciones puras (sin navegador) para poder probarlas con datos reales.
import { amountOf, fitOf, provinceOf, voliaProfile, type FitLevel, type MarketProcess } from "./market.ts";
import type { Tender } from "./tenders.ts";

export type BuyerHistory = { processes: number; ourBids: number; ourWins: number; topWinner: string | null };

/** Qué ha pasado antes con el mismo comprador: cuántas veces ofertó Volia y quién suele ganar. */
export function buyerHistory(all: MarketProcess[], buyer: string, exceptId?: string): BuyerHistory {
  const same = all.filter((p) => p.b === buyer && p.id !== exceptId);
  const wins = new Map<string, number>();
  for (const p of same) for (const w of (p.w ? p.w.split(" / ") : [])) if (w.trim()) wins.set(w.trim(), (wins.get(w.trim()) ?? 0) + 1);
  const top = [...wins.entries()].sort((a, b) => b[1] - a[1])[0];
  return { processes: same.length, ourBids: same.filter((p) => p.vb).length, ourWins: same.filter((p) => p.vw).length, topWinner: top && top[1] >= 2 ? top[0] : null };
}

export type Opportunity = { p: MarketProcess; fit: Exclude<FitLevel, "fuera">; lines: string[]; score: number; reasons: string[]; history: BuyerHistory };

/** Procesos de los últimos `days` días (contados desde el dato más reciente) que encajan, del más conveniente al menos. */
export function opportunities(all: MarketProcess[], opts: { terms?: string[]; days?: number; hiddenIds?: Set<string> } = {}): { items: Opportunity[]; since: string; window: number } {
  const days = opts.days ?? 21;
  const latest = all.reduce((m, p) => (p.d > m ? p.d : m), "");
  if (!latest) return { items: [], since: "", window: 0 };
  const limit = new Date(`${latest}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() - days);
  const since = limit.toISOString().slice(0, 10);
  const recent = all.filter((p) => p.d >= since);
  const profile = voliaProfile(all);
  const items: Opportunity[] = [];
  for (const p of recent) {
    if (opts.hiddenIds?.has(p.id)) continue;
    const f = fitOf(p, opts.terms);
    if (f.level === "fuera") continue;
    const history = buyerHistory(all, p.b, p.id);
    const reasons: string[] = [];
    let score = f.level === "alta" ? 20 : 10;
    reasons.push(f.level === "alta" ? `Encaje alto: ${f.lines.join(" y ").toLowerCase()}` : `Encaje medio: ${f.lines.join(" y ").toLowerCase()}`);
    if (history.ourWins) { score += 5; reasons.push(`Ya le vendimos a este comprador (${history.ourWins} ${history.ourWins === 1 ? "adjudicación" : "adjudicaciones"})`); }
    else if (history.ourBids) { score += 3; reasons.push(`Ya ofertamos a este comprador ${history.ourBids} ${history.ourBids === 1 ? "vez" : "veces"}`); }
    if (p.o > 0 && p.o <= 3) { score += 2; reasons.push(`Poca competencia (${p.o} ${p.o === 1 ? "oferente" : "oferentes"})`); }
    const amount = amountOf(p);
    if (profile && amount > 0 && profile.amountLow && amount >= profile.amountLow && amount <= profile.amountHigh) { score += 1; reasons.push("Monto dentro de lo que solemos ofertar"); }
    if (history.topWinner) reasons.push(`Aquí suele ganar ${history.topWinner}`);
    items.push({ p, fit: f.level, lines: f.lines, score, reasons, history });
  }
  items.sort((a, b) => b.score - a.score || amountOf(b.p) - amountOf(a.p));
  return { items, since, window: recent.length };
}

/** Datos del proceso listos para crear un seguimiento en Licitaciones. */
export function tenderFromProcess(p: MarketProcess): Pick<Tender, "ref" | "title" | "buyer" | "province" | "amount"> {
  return { ref: p.id, title: p.t.replace(/\s+/g, " ").trim().slice(0, 300), buyer: p.b, province: provinceOf(p), amount: Math.round(amountOf(p) * 100) / 100 };
}
