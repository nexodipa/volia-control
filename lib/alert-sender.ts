// Arma el resumen desde la base (D1) y lo envía al Apps Script de Gmail. Lo usan el cron del Worker y la ruta de prueba.
import { buildDigest, ecuadorToday, type Digest, type DigestDoc, type DigestFinance } from "./alert-digest.ts";

export const APP_URL = "https://volia-control.nexodipa.workers.dev";

export type AlertConfig = { url?: string; secret?: string };
export type AlertDb = {
  prepare(query: string): { bind(...values: unknown[]): unknown; all<T>(): Promise<{ results: T[] }> };
};

export function alertsConfigured(cfg: AlertConfig | undefined): cfg is Required<AlertConfig> {
  return !!cfg?.url && /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(cfg.url) && !!cfg.secret;
}

type DocRow = { reference: string; kind: string; subject: string; expires_at: string | null };
type RecRow = { data: string };

export async function loadDigestInput(db: AlertDb) {
  const docs = (await db.prepare("SELECT reference, kind, subject, expires_at FROM regulatory_documents").all<DocRow>()).results.map<DigestDoc>((r) => ({ reference: r.reference, kind: r.kind.replace(/_/g, " "), subject: r.subject, expiresAt: r.expires_at }));
  const records: DigestFinance[] = [];
  const rows = (await db.prepare("SELECT data FROM shared_records WHERE collection = 'finance' AND deleted = 0").all<RecRow>()).results;
  for (const row of rows) {
    try {
      const r = JSON.parse(row.data) as Partial<DigestFinance>;
      if ((r.direction === "income" || r.direction === "expense") && (r.status === "paid" || r.status === "pending")) {
        records.push({ direction: r.direction, status: r.status, dueDate: String(r.dueDate ?? ""), counterparty: String(r.counterparty ?? ""), document: String(r.document ?? ""), subtotal: Number(r.subtotal) || 0, iva: Number(r.iva) || 0, withholding: Number(r.withholding) || 0 });
      }
    } catch { /* registro ilegible: se omite */ }
  }
  return { docs, records };
}

export type SendResult = { ok: boolean; sent: boolean; message: string; counts?: Digest["counts"] };

/** `test` envía siempre algo (incluso sin novedades) para comprobar que el correo llega. */
export async function sendDigest(db: AlertDb, cfg: AlertConfig | undefined, opts: { test?: boolean; now?: Date } = {}): Promise<SendResult> {
  if (!alertsConfigured(cfg)) return { ok: false, sent: false, message: "Las alertas por correo no están configuradas (falta la dirección del script o la clave)." };
  const today = ecuadorToday(opts.now);
  const { docs, records } = await loadDigestInput(db);
  let digest = buildDigest(docs, records, today, APP_URL);
  if (!digest && !opts.test) return { ok: true, sent: false, message: "Sin novedades: no se envió correo." };
  if (!digest) {
    digest = { subject: `Volia Control · Prueba de alertas (${today})`, text: `Las alertas por correo funcionan. Hoy no hay cobros vencidos ni documentos por vencer.\n\nAbrir el sistema: ${APP_URL}`, html: `<p>Las alertas por correo funcionan. Hoy no hay cobros vencidos ni documentos por vencer.</p><p><a href="${APP_URL}">Abrir el sistema</a></p>`, counts: { vencidos: 0, porVencer: 0, cobros: 0, pagos: 0, sinFecha: 0 } };
  } else if (opts.test) {
    digest = { ...digest, subject: `[Prueba] ${digest.subject}` };
  }
  const res = await fetch(cfg.url, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret: cfg.secret, subject: digest.subject, text: digest.text, html: digest.html }) });
  let body: { ok?: boolean; error?: string } = {};
  try { body = await res.json(); } catch { /* respuesta no JSON */ }
  if (!res.ok || !body.ok) return { ok: false, sent: false, message: `El script de Gmail respondió con error${body.error ? `: ${body.error}` : ` (HTTP ${res.status})`}.` };
  return { ok: true, sent: true, message: "Correo enviado.", counts: digest.counts };
}
