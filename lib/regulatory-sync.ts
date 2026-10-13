// Cliente de /api/regulatory. Nunca lanza: devuelve el motivo para que la pantalla siga en modo local.
import type { RegulatoryRecord } from "./regulatory-data";

const ENDPOINT = "/api/regulatory";
export type SyncResult<T> = { ok: true; data: T } | { ok: false; reason: string };

async function reason(res: Response) {
  try { const body = await res.json(); if (body?.error) return String(body.error); } catch { /* sin cuerpo JSON */ }
  return `Error ${res.status}`;
}

export async function pullRegulatory(): Promise<SyncResult<RegulatoryRecord[]>> {
  try {
    const res = await fetch(ENDPOINT, { cache: "no-store" });
    if (!res.ok) return { ok: false, reason: await reason(res) };
    const body = await res.json();
    return Array.isArray(body?.records) ? { ok: true, data: body.records } : { ok: false, reason: "Respuesta inesperada del servidor." };
  } catch {
    return { ok: false, reason: "Sin conexión con el servidor." };
  }
}

export async function pushRegulatory(records: RegulatoryRecord[]): Promise<SyncResult<number>> {
  try {
    const res = await fetch(ENDPOINT, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ records }) });
    if (!res.ok) return { ok: false, reason: await reason(res) };
    const body = await res.json();
    return { ok: true, data: Number(body?.saved) || 0 };
  } catch {
    return { ok: false, reason: "Sin conexión con el servidor." };
  }
}
