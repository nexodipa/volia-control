// Cruce entre las cotizaciones guardadas (historial compartido) y los procesos SERCOP del módulo Mercado.
// El enlace es el campo "Contrato / proceso" de la cotización. SERCOP publica montos normalmente sin IVA,
// por eso se compara contra el subtotal neto de la cotización, no contra el total con IVA.

export type QuoteLike = { number?: string; date?: string; customer?: string; total?: number; savedAt?: string; data?: unknown };
export type LinkedQuote = { number: string; date: string; netCents: number; costCents: number | null; savedAt: string };

const clean = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9-]/g, "");

/** Código base del proceso: el JSON de mercado agrega al final el sufijo numérico del registro OCDS (-41357). */
export function processBase(processId: string): string {
  return clean(processId).replace(/-\d{4,}$/, "");
}

/** Códigos de proceso que aparecen en un texto libre (p. ej. "Proceso SIE-MDMQ-2026-2503, lote 1"). */
export function processCodesIn(text: string): string[] {
  const spaced = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9-]+/g, " ");
  const found = spaced.match(/\b[A-Z]{2,5}-[A-Z0-9]{2,12}-\d{4}-\d{1,6}\b/g) ?? [];
  return [...new Set(found)];
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function figures(q: QuoteLike): { netCents: number; costCents: number | null } | null {
  const data = (q.data && typeof q.data === "object" ? q.data : {}) as { totals?: Record<string, unknown> };
  const net = num(data.totals?.netSubtotal) ?? num(q.total);
  if (net === null || net <= 0) return null;
  const cost = num(data.totals?.totalCost);
  return { netCents: Math.round(net * 100), costCents: cost !== null && cost > 0 ? Math.round(cost * 100) : null };
}

function contractOf(q: QuoteLike): string {
  const data = (q.data && typeof q.data === "object" ? q.data : {}) as { meta?: { contract?: unknown } };
  return typeof data.meta?.contract === "string" ? data.meta.contract : "";
}

/** Para cada proceso, la cotización más reciente cuyo "Contrato / proceso" contiene su código. */
export function linkQuotesToProcesses(processIds: string[], quotes: QuoteLike[]): Map<string, LinkedQuote> {
  const byBase = new Map<string, string>();
  for (const id of processIds) byBase.set(processBase(id), id);
  const out = new Map<string, LinkedQuote>();
  for (const q of quotes) {
    const f = figures(q);
    if (!f) continue;
    for (const code of processCodesIn(contractOf(q))) {
      const processId = byBase.get(code);
      if (!processId) continue;
      const linked: LinkedQuote = { number: q.number || "Sin número", date: q.date || "", savedAt: q.savedAt || "", ...f };
      const prev = out.get(processId);
      if (!prev || linked.savedAt > prev.savedAt) out.set(processId, linked);
    }
  }
  return out;
}
