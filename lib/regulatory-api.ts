// Validación y conversión entre el formato de la pantalla (RegulatoryRecord) y la tabla regulatory_documents.
import type { RegulatoryKind, RegulatoryRecord } from "./regulatory-data";

const KIND_TO_DB: Record<RegulatoryKind, string> = {
  "Registro sanitario": "registro_sanitario",
  "Notificación sanitaria": "notificacion_sanitaria",
  ISO: "iso",
  "Autorización de distribuidor": "autorizacion_distribuidor",
};
const DB_TO_KIND = Object.fromEntries(Object.entries(KIND_TO_DB).map(([k, v]) => [v, k])) as Record<string, RegulatoryKind>;

export type RegulatoryRow = { code: string; kind: string; reference: string; subject: string; covered_items: string; expires_at: string | null; note: string; updated_at?: string };

const MAX_RECORDS = 200; // D1 limita el tamaño de cada batch
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function validateRecords(input: unknown): { ok: true; records: RegulatoryRecord[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "Se esperaba una lista de documentos." };
  if (input.length > MAX_RECORDS) return { ok: false, error: `Máximo ${MAX_RECORDS} documentos por envío.` };
  const seen = new Set<string>();
  const records: RegulatoryRecord[] = [];
  for (const raw of input as Record<string, unknown>[]) {
    const id = text(raw?.id, 120);
    const kind = raw?.kind as RegulatoryKind;
    const reference = text(raw?.reference, 200);
    const expiresAt = raw?.expiresAt === null || raw?.expiresAt === "" ? null : text(raw?.expiresAt, 10);
    if (!id || !/^[a-z0-9._-]+$/i.test(id)) return { ok: false, error: `Identificador inválido: ${id || "(vacío)"}` };
    if (seen.has(id)) return { ok: false, error: `Identificador repetido: ${id}` };
    if (!(kind in KIND_TO_DB)) return { ok: false, error: `Tipo de documento inválido en ${id}` };
    if (!reference) return { ok: false, error: `Falta la referencia en ${id}` };
    if (expiresAt !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAt) || Number.isNaN(Date.parse(expiresAt)))) return { ok: false, error: `Fecha inválida en ${id}` };
    seen.add(id);
    records.push({ id, kind, reference, subject: text(raw?.subject, 400), items: text(raw?.items, 200), expiresAt, note: text(raw?.note, 1000) });
  }
  return { ok: true, records };
}

export function toRow(r: RegulatoryRecord): RegulatoryRow {
  return { code: r.id, kind: KIND_TO_DB[r.kind], reference: r.reference, subject: r.subject, covered_items: r.items, expires_at: r.expiresAt, note: r.note };
}

export function fromRow(row: RegulatoryRow): RegulatoryRecord {
  return { id: row.code, kind: DB_TO_KIND[row.kind] ?? "Registro sanitario", reference: row.reference, subject: row.subject, items: row.covered_items, expiresAt: row.expires_at, note: row.note };
}
