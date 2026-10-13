// Sincronización genérica de colecciones del navegador (arreglos de objetos con `id`) contra shared_records.
// Funciones puras: el cliente las usa para calcular qué subir y cómo quedar después de bajar; el servidor, para validar.

export const SHARED_COLLECTION_NAMES = ["inventory", "movements", "finance"] as const;
export type SharedCollection = (typeof SHARED_COLLECTION_NAMES)[number];

export type SharedRecord = { id: string; data: unknown; updatedAt: string; deleted: boolean };
type WithId = { id: string };

/** Huella de la última versión sincronizada de cada registro: id → JSON. */
export type Shadow = Record<string, string>;

const stable = (value: unknown) => JSON.stringify(value);

/** Registros nuevos o modificados en el equipo desde la última sincronización, y los borrados (lápidas). */
export function computeLocalChanges<T extends WithId>(local: T[], shadow: Shadow, now: string): SharedRecord[] {
  const changes: SharedRecord[] = [];
  const seen = new Set<string>();
  for (const item of local) {
    if (!item || typeof item.id !== "string" || !item.id) continue;
    seen.add(item.id);
    const json = stable(item);
    if (shadow[item.id] !== json) changes.push({ id: item.id, data: item, updatedAt: now, deleted: false });
  }
  for (const id of Object.keys(shadow)) if (!seen.has(id)) changes.push({ id, data: null, updatedAt: now, deleted: true });
  return changes;
}

/**
 * Estado del equipo tras bajar del servidor: el servidor manda. Conserva el orden local de lo que ya existía
 * y antepone lo nuevo (el más reciente primero), como hacen los módulos al registrar.
 */
export function applyRemote<T extends WithId>(local: T[], remote: SharedRecord[]): { next: T[]; shadow: Shadow; changed: boolean } {
  const live = new Map<string, SharedRecord>();
  for (const r of remote) if (!r.deleted) live.set(r.id, r);
  const kept = local.filter((item) => item && live.has(item.id)).map((item) => live.get(item.id)!.data as T);
  const known = new Set(kept.map((item) => item.id));
  const added = [...live.values()]
    .filter((r) => !known.has(r.id))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((r) => r.data as T);
  const next = [...added, ...kept];
  const shadow: Shadow = {};
  for (const item of next) shadow[item.id] = stable(item);
  return { next, shadow, changed: stable(next) !== stable(local) };
}

const MAX_RECORDS = 200;
const MAX_DATA_CHARS = 20_000;

export function isSharedCollection(value: unknown): value is SharedCollection {
  return typeof value === "string" && (SHARED_COLLECTION_NAMES as readonly string[]).includes(value);
}

export function validateSharedRecords(input: unknown): { ok: true; records: SharedRecord[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "Se esperaba una lista de registros." };
  if (input.length > MAX_RECORDS) return { ok: false, error: `Máximo ${MAX_RECORDS} registros por envío.` };
  const seen = new Set<string>();
  const records: SharedRecord[] = [];
  for (const raw of input as Record<string, unknown>[]) {
    const id = typeof raw?.id === "string" ? raw.id.trim() : "";
    if (!id || id.length > 120 || !/^[\w.:-]+$/.test(id)) return { ok: false, error: `Identificador inválido: ${id || "(vacío)"}` };
    if (seen.has(id)) return { ok: false, error: `Identificador repetido: ${id}` };
    const deleted = raw?.deleted === true;
    const data = deleted ? null : raw?.data;
    if (!deleted && (data === null || typeof data !== "object" || Array.isArray(data) || (data as WithId).id !== id)) return { ok: false, error: `Datos inválidos en ${id}` };
    const json = JSON.stringify(data);
    if (json.length > MAX_DATA_CHARS) return { ok: false, error: `Registro demasiado grande: ${id}` };
    const stamp = typeof raw?.updatedAt === "string" ? Date.parse(raw.updatedAt) : NaN;
    if (Number.isNaN(stamp)) return { ok: false, error: `Fecha inválida en ${id}` };
    seen.add(id);
    records.push({ id, data, deleted, updatedAt: new Date(Math.min(stamp, Date.now() + 5 * 60_000)).toISOString() });
  }
  return { ok: true, records };
}
