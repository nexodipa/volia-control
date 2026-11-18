// Arma el resumen desde la base (D1) y lo envía al Apps Script de Gmail. Lo usan el cron del Worker y la ruta de prueba.
import { buildDigest, ecuadorToday, type Digest, type DigestDoc, type DigestFinance } from "./alert-digest.ts";
import { normalizeTender, type Tender } from "./tenders.ts";
import type { MailRecord } from "./mail-sync.ts";
import type { PlanItem, PlanMove } from "./stock-plan.ts";
import type { FollowQuote } from "./quote-followup.ts";

export const APP_URL = "https://volia-control.nexodipa.workers.dev";

export type AlertConfig = { url?: string; secret?: string };
export type AlertDb = {
  prepare(query: string): { bind(...values: unknown[]): unknown; all<T>(): Promise<{ results: T[] }> };
};

export function alertsConfigured(cfg: AlertConfig | undefined): cfg is Required<AlertConfig> {
  return !!cfg?.url && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(cfg.url) && !!cfg.secret;
}

type DocRow = { reference: string; kind: string; subject: string; expires_at: string | null; covered_items?: string };
type RecRow = { data: string };

export async function loadDigestInput(db: AlertDb) {
  const docs = (await db.prepare("SELECT reference, kind, subject, expires_at, covered_items FROM regulatory_documents").all<DocRow>()).results.map<DigestDoc>((r) => ({ reference: r.reference, kind: r.kind.replace(/_/g, " "), subject: r.subject, expiresAt: r.expires_at, items: r.covered_items }));
  const records: DigestFinance[] = [];
  const rows = (await db.prepare("SELECT data FROM shared_records WHERE collection = 'finance' AND deleted = 0").all<RecRow>()).results;
  for (const row of rows) {
    try {
      const r = JSON.parse(row.data) as Partial<DigestFinance>;
      if ((r.direction === "income" || r.direction === "expense") && (r.status === "paid" || r.status === "pending")) {
        records.push({ direction: r.direction, status: r.status, dueDate: String(r.dueDate ?? ""), date: String((r as { date?: unknown }).date ?? ""), counterparty: String(r.counterparty ?? ""), document: String(r.document ?? ""), subtotal: Number(r.subtotal) || 0, iva: Number(r.iva) || 0, withholding: Number(r.withholding) || 0, paidAt: String((r as { paidAt?: unknown }).paidAt ?? "") });
      }
    } catch { /* registro ilegible: se omite */ }
  }
  const tenders: Tender[] = [];
  try {
    const rows = (await db.prepare("SELECT data FROM shared_records WHERE collection = 'tenders' AND deleted = 0").all<RecRow>()).results;
    for (const row of rows) { try { const t = normalizeTender(JSON.parse(row.data)); if (t) tenders.push(t); } catch { /* registro ilegible */ } }
  } catch { /* sin procesos todavía */ }
  const mail: MailRecord[] = [];
  try {
    const rows = (await db.prepare("SELECT data FROM shared_records WHERE collection = 'mail' AND deleted = 0").all<RecRow>()).results;
    for (const row of rows) { try { const m = JSON.parse(row.data) as MailRecord; if (m?.status === "nuevo" && m.fields && m.syncedAt) mail.push(m); } catch { /* registro ilegible */ } }
  } catch { /* sin correo conectado */ }
  const stock: { items: PlanItem[]; moves: PlanMove[] } = { items: [], moves: [] };
  try {
    const inv = (await db.prepare("SELECT data FROM shared_records WHERE collection = 'inventory' AND deleted = 0").all<RecRow>()).results;
    for (const row of inv) { try { const i = JSON.parse(row.data) as Partial<PlanItem>; if (i && typeof i.product === "string") stock.items.push({ id: i.id ? String(i.id) : undefined, code: String(i.code ?? ""), product: i.product, lot: String(i.lot ?? ""), expiry: String(i.expiry ?? ""), stock: Number(i.stock) || 0, reserved: Number(i.reserved) || 0, minimum: Number(i.minimum) || 0, unitCost: Number(i.unitCost) || 0 }); } catch { /* registro ilegible */ } }
    const mov = (await db.prepare("SELECT data FROM shared_records WHERE collection = 'movements' AND deleted = 0").all<RecRow>()).results;
    for (const row of mov) { try { const m = JSON.parse(row.data) as Partial<PlanMove>; if (m && typeof m.type === "string" && typeof m.date === "string") stock.moves.push({ date: m.date, type: m.type, itemId: m.itemId ? String(m.itemId) : undefined, code: String(m.code ?? ""), product: String(m.product ?? ""), quantity: Number(m.quantity) || 0 }); } catch { /* registro ilegible */ } }
  } catch { /* sin inventario todavía */ }
  const quotes: FollowQuote[] = [];
  try {
    const rows = (await db.prepare("SELECT data FROM shared_records WHERE collection = 'quotes' AND deleted = 0").all<RecRow>()).results;
    for (const row of rows) { try { const q = JSON.parse(row.data) as Partial<FollowQuote>; if (q?.status === "sent" && q.sentAt) quotes.push({ number: String(q.number ?? ""), date: String(q.date ?? ""), customer: String(q.customer ?? ""), total: Number(q.total) || 0, status: "sent", sentAt: String(q.sentAt), data: q.data }); } catch { /* registro ilegible */ } }
  } catch { /* sin cotizaciones todavía */ }
  return { docs, records, tenders, mail, stock, quotes };
}

export type SendResult = { ok: boolean; sent: boolean; message: string; counts?: Digest["counts"] };

/** `test` envía siempre algo (incluso sin novedades) para comprobar que el correo llega. */
export async function sendDigest(db: AlertDb, cfg: AlertConfig | undefined, opts: { test?: boolean; now?: Date } = {}): Promise<SendResult> {
  if (!alertsConfigured(cfg)) return { ok: false, sent: false, message: "Las alertas por correo no están configuradas (falta la dirección del script o la clave)." };
  const today = ecuadorToday(opts.now);
  const { docs, records, tenders, mail, stock, quotes } = await loadDigestInput(db);
  let digest = buildDigest(docs, records, today, APP_URL, tenders, mail, stock, quotes);
  if (!digest && !opts.test) return { ok: true, sent: false, message: "Sin novedades: no se envió correo." };
  if (!digest) {
    digest = { subject: `Volia Control · Prueba de alertas (${today})`, text: `Las alertas por correo funcionan. Hoy no hay cobros vencidos ni documentos por vencer.\n\nAbrir el sistema: ${APP_URL}`, html: `<p>Las alertas por correo funcionan. Hoy no hay cobros vencidos ni documentos por vencer.</p><p><a href="${APP_URL}">Abrir el sistema</a></p>`, counts: { vencidos: 0, porVencer: 0, cobros: 0, pagos: 0, sinFecha: 0, procesos: 0, correo: 0, renovaciones: 0, ofertas: 0, semana: 0, inventario: 0, reposicion: 0, cotizaciones: 0, adjudicados: 0 } };
  } else if (opts.test) {
    digest = { ...digest, subject: `[Prueba] ${digest.subject}` };
  }
  const res = await fetch(cfg.url, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret: cfg.secret, subject: digest.subject, text: digest.text, html: digest.html }) });
  let body: { ok?: boolean; error?: string } = {};
  try { body = await res.json(); } catch { /* respuesta no JSON */ }
  if (!res.ok || !body.ok) return { ok: false, sent: false, message: `El script de Gmail respondió con error${body.error ? `: ${body.error}` : ` (HTTP ${res.status})`}.` };
  return { ok: true, sent: true, message: "Correo enviado.", counts: digest.counts };
}
