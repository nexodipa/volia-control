export const STORAGE_KEYS = {
  quoteDraft: "volia-quote-draft-v1",
  quoteHistory: "volia-quote-history-v1",
  cases: "volia-case-tracker-v1",
  financeRecords: "volia-finance-records-v1",
  financeSettings: "volia-finance-settings-v1",
  inventory: "volia-inventory-v1",
  movements: "volia-stock-movements-v1",
  documentDraft: "volia-document-draft-v1",
  documentHistory: "volia-document-history-v1",
  productCatalog: "volia-product-catalog-v1",
  activityLog: "volia-activity-log-v1",
  knowledgeMemory: "volia-knowledge-memory-v1",
  aiSettings: "volia-ai-settings-v1",
  accessibility: "volia-accessibility-v1",
  lastBackup: "volia-last-backup-v1",
  memoryUpdated: "volia-memory-updated-v1",
  regulatoryDocs: "volia-regulatory-docs-v1",
  requirementAliases: "volia-requirement-aliases-v1",
  offerDraft: "volia-offer-draft-v1",
  tenders: "volia-tenders-v1",
} as const;

export const BACKUP_KEYS = new Set<string>(Object.values(STORAGE_KEYS));

export function readStoredArray<T>(key: string, fallback: T[] = []): T[] {
  if (typeof window === "undefined") return fallback;
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function readStoredObject<T extends object>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    return value && typeof value === "object" && !Array.isArray(value)
      ? { ...fallback, ...value }
      : fallback;
  } catch {
    return fallback;
  }
}

export const STORAGE_WRITE_EVENT = "volia-storage-write";

export function writeStoredJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    // Avisa al motor de sincronización compartida (lib/shared-sync.ts) que este equipo cambió datos.
    try { window.dispatchEvent(new CustomEvent(STORAGE_WRITE_EVENT, { detail: { key } })); } catch { /* fuera del navegador */ }
    return true;
  } catch {
    return false;
  }
}

export function isValidBackupValue(key: string, value: string) {
  if (key === STORAGE_KEYS.lastBackup || key === STORAGE_KEYS.memoryUpdated) {
    return !Number.isNaN(Date.parse(value));
  }
  try {
    const parsed = JSON.parse(value);
    const arrayKeys = new Set<string>([
      STORAGE_KEYS.quoteHistory,
      STORAGE_KEYS.cases,
      STORAGE_KEYS.financeRecords,
      STORAGE_KEYS.inventory,
      STORAGE_KEYS.movements,
      STORAGE_KEYS.documentHistory,
      STORAGE_KEYS.productCatalog,
      STORAGE_KEYS.activityLog,
      STORAGE_KEYS.knowledgeMemory,
      STORAGE_KEYS.regulatoryDocs,
      STORAGE_KEYS.requirementAliases,
      STORAGE_KEYS.tenders,
    ]);
    if (arrayKeys.has(key)) return Array.isArray(parsed);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}
