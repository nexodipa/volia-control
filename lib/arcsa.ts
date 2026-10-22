// Catastro oficial de ARCSA (registros sanitarios de dispositivos médicos emitidos por VUE) para completar
// y verificar las fechas de vigencia de los registros que Volia guarda en Vigencias.
import type { RegulatoryRecord } from "./regulatory-data";

/** [fecha de emisión, fecha de vigencia, titular, nombre genérico] */
export type ArcsaEntry = [string, string, string, string];
export type ArcsaCatastro = { fuente: string; corte: string; registros: Record<string, ArcsaEntry> };

export function refKeys(reference: string): string[] {
  const out: string[] = [];
  for (const part of reference.split(/[/,;]| y /)) {
    const k = part.toUpperCase().replace(/\s+/g, "").trim();
    if (!k) continue;
    out.push(k);
    const old = /^DM-(\d+)-(\d\d)-(\d\d)$/.exec(k);
    if (old) out.push(`DM${old[1]}${old[2]}${old[3]}`);
  }
  return out;
}

/** Entrada del catastro para una referencia (si trae dos números, el de vigencia más lejana). */
export function findArcsa(reference: string, catastro: ArcsaCatastro): { key: string; entry: ArcsaEntry } | null {
  let best: { key: string; entry: ArcsaEntry } | null = null;
  for (const k of refKeys(reference)) {
    const entry = catastro.registros[k];
    if (entry && (!best || entry[1] > best.entry[1])) best = { key: k, entry };
  }
  return best;
}

export type ArcsaSuggestion = { id: string; reference: string; current: string | null; arcsa: string; titular: string; emision: string };

/**
 * Registros sanitarios y notificaciones cuya fecha se puede completar o adelantar con el catastro.
 * Nunca propone una fecha anterior a la registrada: el catastro tiene corte y la renovación posterior manda.
 */
export function arcsaSuggestions(records: RegulatoryRecord[], catastro: ArcsaCatastro): ArcsaSuggestion[] {
  const out: ArcsaSuggestion[] = [];
  for (const r of records) {
    if (r.kind !== "Registro sanitario" && r.kind !== "Notificación sanitaria") continue;
    const hit = findArcsa(r.reference, catastro);
    if (!hit || !/^\d{4}-\d{2}-\d{2}$/.test(hit.entry[1])) continue;
    if (r.expiresAt && r.expiresAt >= hit.entry[1]) continue;
    out.push({ id: r.id, reference: r.reference, current: r.expiresAt, arcsa: hit.entry[1], titular: hit.entry[2], emision: hit.entry[0] });
  }
  return out;
}

export function applyArcsa(records: RegulatoryRecord[], suggestions: ArcsaSuggestion[], corte: string, now = new Date().toISOString()): RegulatoryRecord[] {
  const byId = new Map(suggestions.map((s) => [s.id, s]));
  return records.map((r) => {
    const s = byId.get(r.id);
    if (!s) return r;
    const note = `Vigencia según catastro ARCSA (corte ${corte}): emitido ${s.emision}, vigente hasta ${s.arcsa}, titular ${s.titular}.`;
    return { ...r, expiresAt: s.arcsa, note: r.note.includes("catastro ARCSA") ? r.note : `${r.note} ${note}`.trim(), updatedAt: now };
  });
}

let cache: Promise<ArcsaCatastro | null> | null = null;
export function loadArcsa(): Promise<ArcsaCatastro | null> {
  if (!cache) cache = fetch("/data/arcsa-catastro.json", { cache: "force-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return cache;
}
