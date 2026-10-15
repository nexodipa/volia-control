// Programación 2026 del Hospital Carlos Andrade Marín (HECAM): consumo, cantidades, precio referencial,
// y para lo ya contratado, precio adjudicado y proveedor. Sirve para cotizar y para buscar oportunidades.
import { bestNameMatch } from "./market-prices.ts";

export type HecamItem = {
  c?: string; n: string; u?: string; e?: string; cm?: number; q?: number;
  pur?: number; prt?: number; t?: string; pua?: number; g?: string;
};

export const findHecamItem = (description: string, items: HecamItem[]) => bestNameMatch(description, items, (i) => i.n)?.value ?? null;

export type OpportunityFilter = { query?: string; especialidad?: string; tipo?: string; soloPendientes?: boolean };

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Ítems con presupuesto que coinciden con el filtro, de mayor a menor presupuesto. */
export function opportunities(items: HecamItem[], f: OpportunityFilter = {}) {
  const q = fold(f.query ?? "").trim();
  const esp = fold(f.especialidad ?? "");
  return items
    .filter((i) => (i.prt ?? 0) > 0)
    .filter((i) => !f.soloPendientes || !i.g)
    .filter((i) => !f.tipo || i.t === f.tipo)
    .filter((i) => !esp || fold(i.e ?? "").includes(esp))
    .filter((i) => !q || q.split(/\s+/).every((t) => fold(`${i.n} ${i.e ?? ""} ${i.c ?? ""}`).includes(t)))
    .sort((a, b) => (b.prt ?? 0) - (a.prt ?? 0));
}

/** Proveedores adjudicados: ítems y monto (precio adjudicado × cantidad), con nombres normalizados. */
export function contractorRanking(items: HecamItem[], limit = 12) {
  const key = (g: string) => fold(g).replace(/[^a-z0-9 ]/g, "").replace(/\b(s ?a ?s?|cia|ltda|compania|limitada)\b/g, "").replace(/\s+/g, " ").trim();
  const map = new Map<string, { name: string; items: number; amount: number }>();
  for (const i of items) {
    if (!i.g) continue;
    const k = key(i.g);
    const e = map.get(k) ?? { name: i.g, items: 0, amount: 0 };
    e.items++;
    e.amount += (i.pua ?? 0) * (i.q ?? 0);
    map.set(k, e);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, limit).map((e) => ({ ...e, amount: Math.round(e.amount) }));
}

export function specialtyGroups(items: HecamItem[]) {
  const map = new Map<string, number>();
  for (const i of items) if ((i.prt ?? 0) > 0) { const g = (i.e ?? "Sin especialidad").split(",")[0].trim(); map.set(g, (map.get(g) ?? 0) + (i.prt ?? 0)); }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}
