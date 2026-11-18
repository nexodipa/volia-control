import { quoteId } from "./shared-adapters";
import type { QuoteStatus } from "./quote-followup";
import { readStoredArray, STORAGE_KEYS, writeStoredJson } from "./storage";

export type MemorySummary = {
  quotes: number;
  cases: number;
  inventory: number;
  movements: number;
  finance: number;
  documents: number;
  lastBackup: string | null;
};

export type StoredQuote = {
  /** Derivado de número (o fecha:cliente); lo usa la base compartida. */
  id?: string;
  number: string;
  date: string;
  customer: string;
  total: number;
  savedAt: string;
  data: unknown;
  /** Seguimiento: solo las «enviadas» entran al aviso de ofertas sin respuesta. */
  status?: QuoteStatus;
  /** Día (AAAA-MM-DD) en que se marcó enviada. */
  sentAt?: string;
};

const readArrayLength = (key: string) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
};

export function getMemorySummary(): MemorySummary {
  if (typeof window === "undefined") {
    return {
      quotes: 0,
      cases: 0,
      inventory: 0,
      movements: 0,
      finance: 0,
      documents: 0,
      lastBackup: null,
    };
  }
  return {
    quotes: readArrayLength(STORAGE_KEYS.quoteHistory),
    cases: readArrayLength(STORAGE_KEYS.cases),
    inventory: readArrayLength(STORAGE_KEYS.inventory),
    movements: readArrayLength(STORAGE_KEYS.movements),
    finance: readArrayLength(STORAGE_KEYS.financeRecords),
    documents: readArrayLength(STORAGE_KEYS.documentHistory) || (localStorage.getItem(STORAGE_KEYS.documentDraft) ? 1 : 0),
    lastBackup: localStorage.getItem(STORAGE_KEYS.lastBackup),
  };
}

export function getSavedQuotes(): StoredQuote[] {
  if (typeof window === "undefined") return [];
  try {
    return readStoredArray<StoredQuote>(STORAGE_KEYS.quoteHistory);
  } catch { return []; }
}

export function saveQuoteToMemory(snapshot: StoredQuote) {
  const history = getSavedQuotes();
  const identity = snapshot.number.trim() || `${snapshot.date}:${snapshot.customer}`;
  // Guardar de nuevo una oferta no borra su seguimiento.
  const previous = history.find((entry) => (entry.number.trim() || `${entry.date}:${entry.customer}`) === identity);
  const kept = previous?.status ? { status: previous.status, sentAt: previous.sentAt } : {};
  const next = [
    { ...kept, ...snapshot, id: quoteId(snapshot) },
    ...history.filter(
      (entry) =>
        (entry.number.trim() || `${entry.date}:${entry.customer}`) !== identity,
    ),
  ].slice(0, 100);
  writeStoredJson(STORAGE_KEYS.quoteHistory, next);
  localStorage.setItem(STORAGE_KEYS.memoryUpdated, snapshot.savedAt);
  window.dispatchEvent(new Event("volia-memory-updated"));
}

/** Marca una oferta como enviada, ganada o perdida (o quita la marca con null). Al enviarla guarda el día. */
export function setQuoteStatus(savedAt: string, status: QuoteStatus | null, today: string) {
  const next = getSavedQuotes().map((entry) => {
    if (entry.savedAt !== savedAt) return entry;
    const { status: _old, sentAt, ...rest } = entry;
    void _old;
    if (!status) return rest;
    return { ...rest, status, sentAt: status === "sent" ? today : sentAt };
  });
  writeStoredJson(STORAGE_KEYS.quoteHistory, next);
  localStorage.setItem(STORAGE_KEYS.memoryUpdated, new Date().toISOString());
  window.dispatchEvent(new Event("volia-memory-updated"));
  return next;
}

export function removeQuoteFromMemory(savedAt: string) {
  const next = getSavedQuotes().filter((entry) => entry.savedAt !== savedAt);
  writeStoredJson(STORAGE_KEYS.quoteHistory, next);
  localStorage.setItem(STORAGE_KEYS.memoryUpdated, new Date().toISOString());
  window.dispatchEvent(new Event("volia-memory-updated"));
  return next;
}
