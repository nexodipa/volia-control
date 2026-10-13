// Validación y conversión entre el formato de la pantalla (RegulatoryRecord) y la tabla regulatory_documents.
import type { RegulatoryKind, RegulatoryRecord } from "./regulatory-data";

const KIND_TO_DB: Record<RegulatoryKind, string> = {
  "Registro sanitario": "registro_sanitario",
  "Notificación sanitaria": "notificacion_sanitaria",
  ISO: "iso",
  "Autorización de distribuidor": "autorizacion_distribuidor",
};
const DB_TO_KIND = Object.fromEntries(Object.entries(KIND_TO_DB).map(([k, v]) => [v, k])) as Record<string, RegulatoryKind>;

export type RegulatoryRow = { code: string; kind: string; reference: string; subject: string; covered_items: string; expires_at: string | null; note: string; updated_at?: string | null };

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
    const expiresAt = raw?.expiresAt == null || raw?.expiresAt === "" ? null : text(raw?.expiresAt, 10);
    if (!id || !/^[a-z0-9._-]+$/i.test(id)) return { ok: false, error: `Identificador inválido: ${id || "(vacío)"}` };
    if (seen.has(id)) return { ok: false, error: `Identificador repetido: ${id}` };
    if (!(kind in KIND_TO_DB)) return { ok: false, error: `Tipo de documento inválido en ${id}` };
    if (!reference) return { ok: false, error: `Falta la referencia en ${id}` };
    if (expiresAt !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAt) || Number.isNaN(Date.parse(expiresAt)))) return { ok: false, error: `Fecha inválida en ${id}` };
    const updatedAt = text(raw?.updatedAt, 40);
    if (updatedAt && Number.isNaN(Date.parse(updatedAt))) return { ok: false, error: `Fecha de modificación inválida en ${id}` };
    seen.add(id);
    const record: RegulatoryRecord = { id, kind, reference, subject: text(raw?.subject, 400), items: text(raw?.items, 200), expiresAt, note: text(raw?.note, 1000) };
    if (updatedAt) record.updatedAt = new Date(Math.min(Date.parse(updatedAt), Date.now() + 5 * 60_000)).toISOString(); // no se aceptan fechas futuras
    records.push(record);
  }
  return { ok: true, records };
}

export function toRow(r: RegulatoryRecord): RegulatoryRow {
  return { code: r.id, kind: KIND_TO_DB[r.kind], reference: r.reference, subject: r.subject, covered_items: r.items, expires_at: r.expiresAt, note: r.note, updated_at: r.updatedAt ?? null };
}

export function fromRow(row: RegulatoryRow): RegulatoryRecord {
  const record: RegulatoryRecord = { id: row.code, kind: DB_TO_KIND[row.kind] ?? "Registro sanitario", reference: row.reference, subject: row.subject, items: row.covered_items, expiresAt: row.expires_at, note: row.note };
  if (row.updated_at) record.updatedAt = row.updated_at;
  return record;
}

const stamp = (r: RegulatoryRecord) => (r.updatedAt ? Date.parse(r.updatedAt) || 0 : 0);

/**
 * Combina la lista del equipo con la del servidor documento por documento: gana la modificación más reciente.
 * Devuelve la lista combinada y los documentos del equipo que el servidor no tiene o tiene más viejos.
 */
export function mergeRegulatory(local: RegulatoryRecord[], remote: RegulatoryRecord[]) {
  const byId = new Map(remote.map((r) => [r.id, r]));
  const toPush: RegulatoryRecord[] = [];
  for (const l of local) {
    const r = byId.get(l.id);
    if (!r || stamp(l) > stamp(r)) { byId.set(l.id, l); toPush.push(l); }
  }
  const order = [...local.map((r) => r.id), ...remote.map((r) => r.id)];
  const merged = [...new Set(order)].map((id) => byId.get(id)!).filter(Boolean);
  return { merged, toPush };
}
