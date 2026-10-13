// Adaptadores por colección para la base compartida: ids estables para datos que nacieron sin `id`
// y separación de campos privados que nunca salen del equipo (datos del paciente en cotizaciones).
// Funciones puras para poder probarlas sin navegador.

/** Hash FNV-1a de 32 bits en hexadecimal; dos pasadas con semillas distintas dan 64 bits de identificador. */
function fnv(text: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
export const stableHash = (text: string) => fnv(text, 0x811c9dc5) + fnv(text, 0x050c5d1f);

// ---------- Cotizaciones ----------

/** Misma identidad que usa saveQuoteToMemory para no duplicar: número, o fecha:cliente si no hay número. */
export function quoteIdentity(q: { number?: unknown; date?: unknown; customer?: unknown }): string {
  const number = typeof q.number === "string" ? q.number.trim() : "";
  return number || `${String(q.date ?? "")}:${String(q.customer ?? "")}`;
}
export const quoteId = (q: { number?: unknown; date?: unknown; customer?: unknown }) => `q-${stableHash(quoteIdentity(q))}`;

/** Campos de `data.meta` que identifican al paciente: se quedan en el equipo y en el respaldo cifrado. */
export const QUOTE_PRIVATE_FIELDS = ["patient", "hcl", "patientAddress"] as const;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** Copia de la cotización apta para compartir: sin campos del paciente. */
export function shareQuote<T extends Obj>(quote: T): T {
  const data = quote.data;
  if (!isObj(data) || !isObj(data.meta)) return quote;
  const meta: Obj = { ...data.meta };
  for (const f of QUOTE_PRIVATE_FIELDS) delete meta[f];
  return { ...quote, data: { ...data, meta } };
}

/** Devuelve a la versión del servidor los campos del paciente que este equipo ya tenía. */
export function restoreQuote<T extends Obj>(shared: T, local: T | undefined): T {
  if (!local || !isObj(local.data) || !isObj(local.data.meta) || !isObj(shared.data) || !isObj(shared.data.meta)) return shared;
  const localMeta = local.data.meta;
  const meta: Obj = { ...shared.data.meta };
  let touched = false;
  for (const f of QUOTE_PRIVATE_FIELDS) if (f in localMeta) { meta[f] = localMeta[f]; touched = true; }
  return touched ? { ...shared, data: { ...shared.data, meta } } : shared;
}

// ---------- Equivalencias de requerimientos ----------

export const aliasId = (a: { customerKey?: unknown; normalizedText?: unknown }) =>
  `al-${stableHash(`${String(a.customerKey ?? "")}|${String(a.normalizedText ?? "")}`)}`;

// ---------- Utilidad común ----------

/** Asigna `id` a los elementos que no lo tienen. Indica si hubo que tocar algo para guardarlo de vuelta. */
export function ensureIds<T extends Obj>(items: T[], makeId: (item: T) => string): { items: (T & { id: string })[]; changed: boolean } {
  let changed = false;
  const out = items.map((item) => {
    if (typeof item.id === "string" && item.id) return item as T & { id: string };
    changed = true;
    return { ...item, id: makeId(item) };
  });
  return { items: out, changed };
}
