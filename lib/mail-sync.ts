// Sincronización del correo: el Worker consulta (pull) al Apps Script que cada persona instaló en SU cuenta de Gmail,
// clasifica lo recibido y lo guarda en D1 (shared_records, colección "mail"). Solo se leen los correos que la persona
// etiquetó con «Volia»; el script nunca borra, envía ni modifica mensajes (solo marca como procesados con una etiqueta).
import { classifyMail, type MailCategory, type MailFields, type MailInput, type RequestedItem } from "./mail-triage.ts";
import { normalizeTender, type Tender } from "./tenders.ts";

export const MAIL_COLLECTION = "mail";
export const MAIL_META_COLLECTION = "mail_meta";
export const MAIL_RETENTION_DAYS = 90;
export const MAX_PER_PULL = 40; // el plan gratuito de Workers permite 50 subpeticiones por ejecución

export type MailStatus = "nuevo" | "revisado" | "descartado";
export type MailSource = { name: string; url: string; secret: string };

export type MailRecord = {
  id: string;
  source: string;
  receivedAt: string;
  from: { name: string; email: string; domain: string };
  subject: string;
  category: MailCategory;
  confidence: number;
  reasons: string[];
  fields: MailFields;
  excerpt: string;
  items?: RequestedItem[]; // renglones pedidos (cotizaciones y pedidos); los correos anteriores no lo traen
  attachments: string[];
  link: string;
  status: MailStatus;
  syncedAt: string;
};

export type MailDb = {
  prepare(query: string): { bind(...values: unknown[]): unknown; all<T>(): Promise<{ results: T[] }> };
  batch(statements: unknown[]): Promise<unknown>;
};

export type SyncResult = { source: string; fetched: number; added: number; ok: boolean; message: string };
export type SyncMeta = { at: string; ok: boolean; fetched: number; added: number; message: string };

const SCRIPT_URL = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
const GMAIL_LINK = /^https:\/\/mail\.google\.com\//;

/** `MAIL_SOURCES` es un JSON con una entrada por buzón: [{"name":"Josué","url":"https://script.google.com/…/exec","secret":"…"}]. */
export function parseMailSources(raw: string | undefined): MailSource[] {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const out: MailSource[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const { name, url, secret } = item as Record<string, unknown>;
    if (typeof name !== "string" || typeof url !== "string" || typeof secret !== "string") continue;
    const cleanName = name.trim();
    if (!/^[\p{L}\p{N} ._-]{1,40}$/u.test(cleanName) || seen.has(cleanName)) continue;
    if (!SCRIPT_URL.test(url.trim()) || secret.trim().length < 8) continue;
    seen.add(cleanName);
    out.push({ name: cleanName, url: url.trim(), secret: secret.trim() });
  }
  return out.slice(0, 5); // cada buzón gasta 2 de las 50 subpeticiones por ejecución
}

type RawMail = { id?: unknown; from?: unknown; subject?: unknown; date?: unknown; body?: unknown; link?: unknown; attachments?: unknown };

function toInput(raw: RawMail): (MailInput & { id: string; date: string; link: string }) | null {
  if (typeof raw.id !== "string" || !/^[\w-]{4,64}$/.test(raw.id)) return null;
  const date = typeof raw.date === "string" && !Number.isNaN(Date.parse(raw.date)) ? new Date(raw.date).toISOString() : "";
  if (!date) return null;
  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments.map((a) => (typeof a === "string" ? a : typeof (a as { name?: unknown })?.name === "string" ? (a as { name: string }).name : "")).filter(Boolean).slice(0, 12).map((n) => ({ name: n.slice(0, 120) }))
    : [];
  return {
    id: raw.id,
    date,
    from: typeof raw.from === "string" ? raw.from.slice(0, 300) : "",
    subject: typeof raw.subject === "string" ? raw.subject.slice(0, 300) : "",
    body: typeof raw.body === "string" ? raw.body.slice(0, 20_000) : "",
    link: typeof raw.link === "string" && GMAIL_LINK.test(raw.link) ? raw.link.slice(0, 300) : "",
    attachments,
  };
}

export function buildMailRecord(source: string, raw: RawMail, now: Date): MailRecord | null {
  const input = toInput(raw);
  if (!input) return null;
  const t = classifyMail(input);
  return {
    id: `${source}:${input.id}`,
    source,
    receivedAt: input.date,
    from: t.sender,
    subject: input.subject.replace(/\s+/g, " ").trim().slice(0, 200),
    category: t.category,
    confidence: t.confidence,
    reasons: t.reasons,
    fields: t.fields,
    excerpt: t.excerpt,
    items: t.items,
    attachments: (input.attachments ?? []).map((a) => a.name),
    link: input.link,
    status: "nuevo",
    syncedAt: now.toISOString(),
  };
}

type ScriptReply = { ok?: boolean; error?: string; mails?: RawMail[]; acked?: number };

async function callScript(source: MailSource, payload: Record<string, unknown>, fetchImpl: typeof fetch): Promise<ScriptReply> {
  const res = await fetchImpl(source.url, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ secret: source.secret, ...payload }),
    signal: AbortSignal.timeout(25_000),
  });
  let body: ScriptReply = {};
  try { body = (await res.json()) as ScriptReply; } catch { /* respuesta no JSON */ }
  if (!res.ok || !body.ok) throw new Error(body.error ? `el script respondió: ${body.error}` : `el script respondió con error (HTTP ${res.status})`);
  return body;
}

const INSERT = "INSERT OR IGNORE INTO shared_records (collection, record_id, data, updated_at, deleted, updated_by) VALUES (?, ?, ?, ?, 0, 'correo')";
const META = "INSERT OR REPLACE INTO shared_records (collection, record_id, data, updated_at, deleted, updated_by) VALUES (?, ?, ?, ?, 0, 'correo')";

const bind = (stmt: unknown, ...v: unknown[]) => (stmt as { bind(...x: unknown[]): unknown }).bind(...v);

function changesOf(batchResult: unknown): number {
  if (!Array.isArray(batchResult)) return 0;
  return batchResult.reduce<number>((n, r) => n + ((r as { meta?: { changes?: number } })?.meta?.changes ?? 0), 0);
}

async function saveMeta(db: MailDb, name: string, meta: SyncMeta) {
  try { await db.batch([bind(db.prepare(META), MAIL_META_COLLECTION, name, JSON.stringify(meta), meta.at)]); } catch { /* anotar es opcional */ }
}

const TENDERS = "tenders";

/** Un correo del SERCOP con código de proceso deja el proceso en «Por revisar» en Procesos (una vez por código; si ya existe, aunque esté descartado, no se toca). */
export async function addTendersFromMail(db: MailDb, records: MailRecord[], now: Date = new Date()): Promise<number> {
  const wanted = new Map<string, MailRecord>();
  for (const r of records) if (r.category === "sercop") for (const code of r.fields.processCodes) if (!wanted.has(code)) wanted.set(code, r);
  if (!wanted.size) return 0;
  const known = new Set<string>();
  for (const row of (await (db.prepare("SELECT data FROM shared_records WHERE collection = ?").bind(TENDERS) as unknown as { all<T>(): Promise<{ results: T[] }> }).all<{ data: string }>()).results) {
    try { const t = normalizeTender(JSON.parse(row.data)); if (t?.ref) known.add(t.ref.toUpperCase()); } catch { /* registro ilegible */ }
  }
  const stmt = db.prepare("INSERT OR IGNORE INTO shared_records (collection, record_id, data, updated_at, deleted, updated_by) VALUES (?, ?, ?, ?, 0, 'correo')");
  const at = now.toISOString();
  const rows: unknown[] = [];
  for (const [code, r] of wanted) {
    if (known.has(code.toUpperCase())) continue;
    const tender: Tender = { id: `correo-${code}`, ref: code, title: r.subject || code, buyer: "", province: "", amount: 0, deadline: r.fields.deadline, status: "interested", ourPrice: 0, winnerPrice: 0, winner: "", notes: `Agregado desde el correo de ${r.source} (${r.receivedAt.slice(0, 10)}). Revise el pliego y la fecha límite en el portal.`, createdAt: at };
    rows.push(bind(stmt, TENDERS, tender.id, JSON.stringify(tender), at));
  }
  if (!rows.length) return 0;
  return changesOf(await db.batch(rows));
}

export async function syncMailbox(db: MailDb, source: MailSource, opts: { fetchImpl?: typeof fetch; now?: Date } = {}): Promise<SyncResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? new Date();
  const finish = async (r: Omit<SyncResult, "source">): Promise<SyncResult> => {
    await saveMeta(db, source.name, { at: now.toISOString(), ok: r.ok, fetched: r.fetched, added: r.added, message: r.message });
    return { source: source.name, ...r };
  };
  let mails: RawMail[];
  try {
    mails = (await callScript(source, { action: "pull", max: MAX_PER_PULL }, fetchImpl)).mails ?? [];
  } catch (e) {
    return finish({ ok: false, fetched: 0, added: 0, message: `No se pudo leer el buzón: ${e instanceof Error ? e.message : "error desconocido"}.` });
  }
  const records = mails.slice(0, MAX_PER_PULL).map((m) => buildMailRecord(source.name, m, now)).filter((r): r is MailRecord => !!r);
  let added = 0;
  let tendersAdded = 0;
  if (records.length) {
    try {
      const stmt = db.prepare(INSERT);
      added = changesOf(await db.batch(records.map((r) => bind(stmt, MAIL_COLLECTION, r.id, JSON.stringify(r), r.syncedAt))));
    } catch (e) {
      return finish({ ok: false, fetched: records.length, added: 0, message: `No se pudieron guardar los correos: ${e instanceof Error ? e.message : "error desconocido"}.` });
    }
    // Los procesos del SERCOP pasan solos a seguimiento; si esto falla no se pierde el correo ni se detiene la lectura.
    try { tendersAdded = await addTendersFromMail(db, records, now); } catch { /* el correo ya está guardado */ }
    // Solo se marcan como procesados después de guardarlos; si esto falla, el próximo pull los repite y no se duplican.
    try { await callScript(source, { action: "ack", ids: records.map((r) => r.id.slice(source.name.length + 1)) }, fetchImpl); }
    catch (e) { return finish({ ok: true, fetched: records.length, added, message: `Se guardaron ${added} correos nuevos${tendersAdded ? ` y ${tendersAdded} proceso(s) pasaron a Procesos` : ""}, pero no se pudieron marcar como leídos (${e instanceof Error ? e.message : "error"}). No se duplicarán.` }); }
  }
  const followed = tendersAdded ? ` ${tendersAdded} proceso(s) del SERCOP pasaron a Procesos para revisar.` : "";
  return finish({ ok: true, fetched: records.length, added, message: records.length ? `${added} correos nuevos de ${records.length} leídos.${followed}` : "Sin correos nuevos con la etiqueta Volia." });
}

export async function syncAll(db: MailDb, sources: MailSource[], opts: { fetchImpl?: typeof fetch; now?: Date } = {}): Promise<SyncResult[]> {
  const out: SyncResult[] = [];
  for (const s of sources) out.push(await syncMailbox(db, s, opts).catch((e): SyncResult => ({ source: s.name, fetched: 0, added: 0, ok: false, message: `Error inesperado: ${e instanceof Error ? e.message : "desconocido"}` })));
  return out;
}

/** Borra los correos con más de `days` días sin tocar (la fecha de actualización avanza al cambiar su estado). */
export async function pruneMail(db: MailDb, now: Date = new Date(), days = MAIL_RETENTION_DAYS): Promise<void> {
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString();
  await db.batch([bind(db.prepare("DELETE FROM shared_records WHERE collection = ? AND updated_at < ?"), MAIL_COLLECTION, cutoff)]);
}

export async function listMail(db: MailDb, limit = 300): Promise<MailRecord[]> {
  const stmt = db.prepare("SELECT data FROM shared_records WHERE collection = ? AND deleted = 0 ORDER BY updated_at DESC LIMIT ?").bind(MAIL_COLLECTION, limit) as unknown as { all<T>(): Promise<{ results: T[] }> };
  const out: MailRecord[] = [];
  for (const row of (await stmt.all<{ data: string }>()).results) { try { out.push(JSON.parse(row.data) as MailRecord); } catch { /* registro ilegible */ } }
  return out.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export async function listMailMeta(db: MailDb): Promise<Record<string, SyncMeta>> {
  const stmt = db.prepare("SELECT record_id, data FROM shared_records WHERE collection = ?").bind(MAIL_META_COLLECTION) as unknown as { all<T>(): Promise<{ results: T[] }> };
  const out: Record<string, SyncMeta> = {};
  for (const row of (await stmt.all<{ record_id: string; data: string }>()).results) { try { out[row.record_id] = JSON.parse(row.data) as SyncMeta; } catch { /* omitido */ } }
  return out;
}

export const isMailStatus = (v: unknown): v is MailStatus => v === "nuevo" || v === "revisado" || v === "descartado";

export async function setMailStatus(db: MailDb, id: string, status: MailStatus, email: string, now: Date = new Date()): Promise<void> {
  await db.batch([bind(db.prepare("UPDATE shared_records SET data = json_set(data, '$.status', ?), updated_at = ?, updated_by = ? WHERE collection = ? AND record_id = ?"), status, now.toISOString(), email, MAIL_COLLECTION, id)]);
}

/** Resumen para el cron y la pantalla: cuántos hay por revisar y los plazos más cercanos. */
export function mailSummary(records: MailRecord[], today: string) {
  const pending = records.filter((r) => r.status === "nuevo");
  const deadlines = pending.filter((r) => r.fields.deadline && r.fields.deadline >= today).sort((a, b) => a.fields.deadline.localeCompare(b.fields.deadline));
  return { pending: pending.length, nextDeadline: deadlines[0]?.fields.deadline ?? "", urgent: deadlines.filter((r) => r.fields.deadline <= new Date(Date.parse(today) + 3 * 86_400_000).toISOString().slice(0, 10)).length };
}
