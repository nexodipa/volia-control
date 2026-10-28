// Envío del informe mensual por Gmail: una sola vez por mes, el primer día hábil (si falla, se reintenta los días siguientes hasta el 7) (queda anotado en D1) y con opción de prueba.
import { ecuadorToday } from "./alert-digest.ts";
import { alertsConfigured, APP_URL, loadDigestInput, type AlertConfig, type AlertDb, type SendResult } from "./alert-sender.ts";
import { readMeta, saveMeta } from "./heartbeat.ts";
import { buildMonthlyReport, inReportWindow } from "./monthly-report.ts";

/** Informe mensual: se envía el primer día hábil (o cuando se pide una prueba) y una sola vez por mes. */
export async function sendMonthlyReport(db: AlertDb & { batch(statements: unknown[]): Promise<unknown> }, cfg: AlertConfig | undefined, opts: { test?: boolean; now?: Date } = {}): Promise<SendResult> {
  if (!alertsConfigured(cfg)) return { ok: false, sent: false, message: "Las alertas por correo no están configuradas (falta la dirección del script o la clave)." };
  const today = ecuadorToday(opts.now);
  if (!opts.test && !inReportWindow(today)) return { ok: true, sent: false, message: "Hoy no toca informe mensual." };
  const { docs, records, tenders } = await loadDigestInput(db);
  const report = buildMonthlyReport({ records, tenders, docs }, today, APP_URL);
  if (!report) return { ok: true, sent: false, message: "Todavía no hay datos suficientes para un informe mensual." };
  const id = `monthly-${report.monthKey}`;
  if (!opts.test && (await readMeta(db, id))?.sent) return { ok: true, sent: false, message: `El informe de ${report.monthKey} ya se envió.` };
  const subject = opts.test ? `[Prueba] ${report.subject}` : report.subject;
  const res = await fetch(cfg.url, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret: cfg.secret, subject, text: report.text, html: report.html }) });
  let body: { ok?: boolean; error?: string } = {};
  try { body = await res.json(); } catch { /* respuesta no JSON */ }
  if (!res.ok || !body.ok) return { ok: false, sent: false, message: `El script de Gmail respondió con error${body.error ? `: ${body.error}` : ` (HTTP ${res.status})`}.` };
  if (!opts.test) await saveMeta(db, id, { at: (opts.now ?? new Date()).toISOString(), ok: true, sent: true, message: "Informe mensual enviado." });
  return { ok: true, sent: true, message: opts.test ? "Informe mensual de prueba enviado." : "Informe mensual enviado." };
}
