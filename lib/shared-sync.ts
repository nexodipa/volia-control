// Motor de sincronización de colecciones del navegador con /api/records
// (inventario, movimientos, finanzas, historial de cotizaciones y equivalencias de requerimientos).
// Ciclo: subir lo que cambió en este equipo → bajar todo → dejar el equipo igual al servidor.
// Si el usuario cambió algo mientras viajaba la red, no se pisa: se sincroniza en la siguiente vuelta.
import { applyRemote, computeLocalChanges, type Shadow, type SharedCollection, type SharedRecord } from "./shared-records.ts";
import { aliasId, ensureIds, quoteId, restoreQuote, shareQuote } from "./shared-adapters.ts";
import { readStoredArray, STORAGE_KEYS } from "./storage.ts";

type Item = Record<string, unknown> & { id: string };
type SyncedCollection = {
  collection: SharedCollection;
  key: string;
  /** Para datos que nacieron sin `id`. */
  makeId?: (item: Record<string, unknown>) => string;
  /** Versión que sale del equipo (sin campos privados). */
  share?: (item: Item) => Item;
  /** Reincorpora los campos privados locales a la versión que llega del servidor. */
  restore?: (shared: Item, local: Item | undefined) => Item;
};

export const SYNCED_COLLECTIONS: SyncedCollection[] = [
  { collection: "inventory", key: STORAGE_KEYS.inventory },
  { collection: "movements", key: STORAGE_KEYS.movements },
  { collection: "finance", key: STORAGE_KEYS.financeRecords },
  { collection: "quotes", key: STORAGE_KEYS.quoteHistory, makeId: quoteId, share: shareQuote, restore: restoreQuote },
  { collection: "aliases", key: STORAGE_KEYS.requirementAliases, makeId: aliasId },
  { collection: "tenders", key: STORAGE_KEYS.tenders },
];
export const SYNCED_KEYS = new Set(SYNCED_COLLECTIONS.map((c) => c.key));

const ENDPOINT = "/api/records";
const CHUNK = 25;
const shadowKey = (c: SharedCollection) => `volia-shared-shadow-${c}`;

export type SyncOutcome = { ok: true; changedLocally: boolean; uploaded: number } | { ok: false; reason: string };

function readShadow(c: SharedCollection): Shadow {
  try { const v = JSON.parse(localStorage.getItem(shadowKey(c)) || "{}"); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; } catch { return {}; }
}

async function reason(res: Response) {
  try { const body = await res.json(); if (body?.error) return String(body.error); } catch { /* sin JSON */ }
  return `Error ${res.status}`;
}

async function syncOne({ collection, key, makeId, share, restore }: SyncedCollection): Promise<SyncOutcome> {
  const raw = readStoredArray<Record<string, unknown>>(key);
  const withIds = makeId ? ensureIds(raw, makeId) : { items: raw as Item[], changed: false };
  const local = withIds.items as Item[];
  if (withIds.changed) {
    try { localStorage.setItem(key, JSON.stringify(local)); } catch { return { ok: false, reason: "No se pudo guardar en este equipo." }; }
  }
  const outgoing = share ? local.map(share) : local;
  const changes = computeLocalChanges(outgoing, readShadow(collection), new Date().toISOString());
  for (let i = 0; i < changes.length; i += CHUNK) {
    const res = await fetch(ENDPOINT, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collection, records: changes.slice(i, i + CHUNK) }) });
    if (!res.ok) return { ok: false, reason: await reason(res) };
  }
  const res = await fetch(`${ENDPOINT}?collection=${collection}`, { cache: "no-store" });
  if (!res.ok) return { ok: false, reason: await reason(res) };
  const remote = ((await res.json())?.records ?? []) as SharedRecord[];
  const current = readStoredArray<Record<string, unknown>>(key);
  if (JSON.stringify(current) !== JSON.stringify(local)) return { ok: true, changedLocally: false, uploaded: changes.length }; // cambió mientras tanto
  const applied = applyRemote(outgoing, remote);
  const byId = new Map(local.map((item) => [item.id, item]));
  const next = restore ? applied.next.map((item) => restore(item, byId.get(item.id))) : applied.next;
  const changed = JSON.stringify(next) !== JSON.stringify(local);
  try {
    if (changed) localStorage.setItem(key, JSON.stringify(next)); // sin evento de escritura: no es un cambio del usuario
    localStorage.setItem(shadowKey(collection), JSON.stringify(applied.shadow));
  } catch { return { ok: false, reason: "No se pudo guardar en este equipo." }; }
  return { ok: true, changedLocally: changed, uploaded: changes.length };
}

let inFlight: Promise<SyncOutcome> | null = null;

/** Sincroniza todas las colecciones, una a la vez. Llamadas simultáneas comparten la misma ejecución. */
export function syncAll(): Promise<SyncOutcome> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    let changedLocally = false;
    let uploaded = 0;
    try {
      for (const entry of SYNCED_COLLECTIONS) {
        const r = await syncOne(entry);
        if (!r.ok) return r;
        changedLocally ||= r.changedLocally;
        uploaded += r.uploaded;
      }
      return { ok: true as const, changedLocally, uploaded };
    } catch {
      return { ok: false as const, reason: "Sin conexión con el servidor." };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
