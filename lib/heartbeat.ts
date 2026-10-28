// Latido del resumen diario: deja anotado cuándo corrió y cómo salió, decide si hay que reintentar por la tarde y
// avisa a un vigilante externo (healthchecks.io u otro) para enterarse aunque el Worker o Gmail estén caídos.
import { ecuadorToday } from "./alert-digest.ts";
import { sendDigest, type AlertConfig, type AlertDb, type SendResult } from "./alert-sender.ts";

export type RunMeta = { at: string; ok: boolean; sent: boolean; message: string };
type MetaDb = AlertDb & { batch(statements: unknown[]): Promise<unknown> };

const COLLECTION = "system_meta";
/** El cron de la mañana corre a las 13:00 UTC (08:00 de Ecuador), de lunes a viernes. */
const SLOT_HOUR_UTC = 13;
const GRACE_MS = 30 * 60_000;
export const MORNING_CRON = "0 13 * * 1-5";
export const RETRY_CRON = "0 19 * * 1-5";

export async function readMeta(db: AlertDb, id: string): Promise<RunMeta | null> {
  try {
    const stmt = db.prepare("SELECT data FROM shared_records WHERE collection = ? AND record_id = ?").bind(COLLECTION, id) as { all<T>(): Promise<{ results: T[] }> };
    const row = (await stmt.all<{ data: string }>()).results[0];
    return row ? (JSON.parse(row.data) as RunMeta) : null;
  } catch { return null; }
}

export async function saveMeta(db: MetaDb, id: string, meta: RunMeta): Promise<void> {
  try {
    const stmt = db.prepare("INSERT OR REPLACE INTO shared_records (collection, record_id, data, updated_at, deleted, updated_by) VALUES (?, ?, ?, ?, 0, 'heartbeat')") as unknown as { bind(...v: unknown[]): unknown };
    await db.batch([stmt.bind(COLLECTION, id, JSON.stringify(meta), meta.at)]);
  } catch { /* anotar el latido es opcional */ }
}

/** Envía el resumen y anota el resultado (el error inesperado también queda anotado). */
export async function runAndRecordDigest(db: MetaDb, cfg: AlertConfig | undefined, opts: { now?: Date; test?: boolean } = {}): Promise<SendResult> {
  const result = await sendDigest(db, cfg, opts).catch((e): SendResult => ({ ok: false, sent: false, message: `Error inesperado: ${e instanceof Error ? e.message : "desconocido"}` }));
  if (!opts.test) await saveMeta(db, "digest", { at: (opts.now ?? new Date()).toISOString(), ok: result.ok, sent: result.sent, message: result.message });
  return result;
}

/** Ejecuciones programadas (lunes a viernes, 08:00) que debieron ocurrir después de `lastAt` y ya no tienen excusa. */
export function missedRuns(lastAt: string | null, now: Date = new Date()): number {
  const last = lastAt ? new Date(lastAt).getTime() : NaN;
  if (!Number.isFinite(last)) return 0;
  const start = new Date(last);
  start.setUTCHours(0, 0, 0, 0);
  let missed = 0;
  for (let day = start.getTime(), i = 0; i < 400; day += 86_400_000, i += 1) {
    const slot = day + SLOT_HOUR_UTC * 3_600_000;
    if (slot + GRACE_MS > now.getTime()) break;
    const weekday = new Date(slot).getUTCDay();
    if (weekday >= 1 && weekday <= 5 && slot > last) missed += 1;
  }
  return missed;
}

export type Health = "ok" | "late" | "down" | "unknown";
/** ok: al día. late: falló una ejecución. down: dos o más seguidas sin correr, o el último intento terminó mal. */
export function runHealth(meta: RunMeta | null, now: Date = new Date()): Health {
  if (!meta) return "unknown";
  const missed = missedRuns(meta.at, now);
  if (missed >= 2) return "down";
  if (!meta.ok || missed === 1) return "late";
  return "ok";
}

/** ¿Hay que reintentar por la tarde? Si hoy no corrió o terminó con error. */
export function needsRetry(meta: Pick<RunMeta, "at" | "ok"> | null, today: string): boolean {
  if (!meta) return true;
  if (!meta.ok) return true;
  return ecuadorToday(new Date(meta.at)) !== today;
}

export function healthcheckUrl(raw: string | undefined): string | null {
  const url = raw?.trim();
  return url && /^https:\/\/[\w.-]+\/[\w./-]+$/.test(url) ? url.replace(/\/+$/, "") : null;
}

/** Avisa al vigilante externo: éxito en la dirección tal cual, fallo en `/fail`. Nunca lanza error. */
export async function pingHealthcheck(raw: string | undefined, ok: boolean, fetcher: typeof fetch = fetch): Promise<boolean> {
  const url = healthcheckUrl(raw);
  if (!url) return false;
  try {
    const res = await fetcher(ok ? url : `${url}/fail`, { method: "GET", signal: AbortSignal.timeout(10_000) });
    return res.ok;
  } catch { return false; }
}
