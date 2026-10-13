// Cruza líneas de cotización con documentos regulatorios por raíces de palabras.
// Es una ayuda, no una garantía: propone el documento más probable y su estado; la persona confirma.
import { daysUntil, expiryStatus, type ExpiryStatus } from "./business-alerts.ts";
import type { RegulatoryRecord } from "./regulatory-data";

const STOP = new Set([
  "para", "con", "sin", "unidad", "unidades", "medico", "medica", "medicos", "medicas", "dispositivo", "dispositivos",
  "esteril", "esteriles", "set", "kit", "paquete", "componente", "del", "los", "las", "una", "uso", "tipo", "marca", "caja",
  "frasco", "general", "registro", "sanitario", "certificado", "toma", "muestra", "prueba", "objetos", "descartable",
  "descartables", "quimicos", "notificacion",
]);

function stemList(text: string): string[] {
  const words = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ]+/g, " ").split(" ");
  return words.filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d/.test(w)).map((w) => w.slice(0, 5));
}

export function stems(text: string): Set<string> {
  return new Set(stemList(text));
}

export type LineRegulatoryStatus = { record: RegulatoryRecord; status: ExpiryStatus | "sin-fecha"; days: number | null; score: number };

/**
 * Documento regulatorio más probable para una descripción (solo registros y notificaciones sanitarias).
 * Regla principal: el sustantivo inicial de la línea debe aparecer en el documento, porque en español va
 * primero ("Aguja hipodérmica" no es "Jeringa hipodérmica"), y si la línea tiene dos o más palabras
 * significativas deben coincidir al menos dos. El puntaje ordena entre candidatos.
 */
export function findRegulatoryDoc(description: string, records: RegulatoryRecord[], today: string, minScore = 0.2): LineRegulatoryStatus | null {
  const list = stemList(description);
  if (!list.length) return null;
  const line = new Set(list);
  const head = list[0];
  let best: LineRegulatoryStatus | null = null;
  for (const record of records) {
    if (record.kind !== "Registro sanitario" && record.kind !== "Notificación sanitaria") continue;
    const doc = stems(`${record.subject} ${record.reference}`);
    if (!doc.has(head)) continue;
    let shared = 0;
    for (const s of line) if (doc.has(s)) shared++;
    if (shared < Math.min(2, line.size)) continue; // "Alcohol etílico" no es "Gel alcohol"; "Tira reactiva" no es "Tira adhesiva"
    const score = shared / Math.min(line.size, doc.size);
    if (score < minScore) continue;
    if (!best || score > best.score) {
      best = { record, score, status: record.expiresAt ? expiryStatus(record.expiresAt, today) : "sin-fecha", days: record.expiresAt ? daysUntil(record.expiresAt, today) : null };
    }
  }
  return best;
}

export const needsAttention = (s: LineRegulatoryStatus | null) => !!s && s.status !== "vigente";
