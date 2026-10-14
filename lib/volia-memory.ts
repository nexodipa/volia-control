import { quoteId } from "./shared-adapters";
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
  const next = [
    { ...snapshot, id: quoteId(snapshot) },
    ...history.filter(
      (entry) =>
        (entry.number.trim() || `${entry.date}:${entry.customer}`) !== identity,
    ),
  ].slice(0, 100);
  writeStoredJson(STORAGE_KEYS.quoteHistory, next);
  localStorage.setItem(STORAGE_KEYS.memoryUpdated, snapshot.savedAt);
  window.dispatchEvent(new Event("volia-memory-updated"));
}

export function removeQuoteFromMemory(savedAt: string) {
  const next = getSavedQuotes().filter((entry) => entry.savedAt !== savedAt);
  writeStoredJson(STORAGE_KEYS.quoteHistory, next);
  localStorage.setItem(STORAGE_KEYS.memoryUpdated, new Date().toISOString());
  window.dispatchEvent(new Event("volia-memory-updated"));
  return next;
}
