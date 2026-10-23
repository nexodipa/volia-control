// Resumen de alertas por correo: reglas puras (sin base de datos ni red) para poder probarlas.
// Lunes: informe completo. Martes a viernes: solo novedades (umbrales que se cruzan ese día).
import { daysUntil, expiryStatus } from "./business-alerts.ts";

export type DigestDoc = { reference: string; kind: string; subject: string; expiresAt: string | null };
export type DigestFinance = {
  direction: "income" | "expense";
  status: "paid" | "pending";
  dueDate: string;
  counterparty: string;
  document: string;
  subtotal: number;
  iva: number;
  withholding: number;
};
export type Digest = { subject: string; text: string; html: string; counts: { vencidos: number; porVencer: number; cobros: number; pagos: number; sinFecha: number } };

/** Fecha de hoy en Ecuador (UTC-5, sin horario de verano). */
export function ecuadorToday(now = new Date()): string {
  return new Date(now.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}
export function isMonday(today: string): boolean {
  return new Date(`${today}T12:00:00Z`).getUTCDay() === 1;
}

const DOC_THRESHOLDS = [90, 60, 30, 15, 7, 3, 0];
const OVERDUE_MARKS = [1, 7, 15, 30, 60, 90];
const money = (n: number) => `USD ${n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const total = (r: DigestFinance) => Math.round((r.subtotal + r.iva - r.withholding) * 100) / 100;

export function buildDigest(docs: DigestDoc[], records: DigestFinance[], today: string, appUrl: string): Digest | null {
  const full = isMonday(today);

  const dated = docs.filter((d): d is DigestDoc & { expiresAt: string } => !!d.expiresAt).map((d) => ({ ...d, days: daysUntil(d.expiresAt, today) }));
  const sinFecha = docs.length - dated.length;
  const vencidos = dated.filter((d) => d.days < 0).sort((a, b) => b.days - a.days);
  const porVencerAll = dated.filter((d) => d.days >= 0 && expiryStatus(d.expiresAt, today) !== "vigente").sort((a, b) => a.days - b.days);
  const porVencer = full ? porVencerAll : porVencerAll.filter((d) => DOC_THRESHOLDS.includes(d.days));
  const vencidosShown = full ? vencidos : vencidos.filter((d) => d.days === -1);

  const cobrosAll = records
    .filter((r) => r.direction === "income" && r.status === "pending" && r.dueDate && daysUntil(r.dueDate, today) < 0)
    .map((r) => ({ ...r, overdue: -daysUntil(r.dueDate, today) }))
    .sort((a, b) => b.overdue - a.overdue);
  const cobros = full ? cobrosAll : cobrosAll.filter((r) => OVERDUE_MARKS.includes(r.overdue));
  const pagosAll = records
    .filter((r) => r.direction === "expense" && r.status === "pending" && r.dueDate && daysUntil(r.dueDate, today) <= 7)
    .map((r) => ({ ...r, days: daysUntil(r.dueDate, today) }))
    .sort((a, b) => a.days - b.days);
  const pagos = full ? pagosAll : pagosAll.filter((r) => r.days === 7 || r.days === 3 || r.days === 0 || r.days === -1);

  if (!vencidosShown.length && !porVencer.length && !cobros.length && !pagos.length) return null;

  const sections: { title: string; lines: string[] }[] = [];
  if (cobros.length) sections.push({ title: `Cobros vencidos (${cobros.length}, ${money(cobros.reduce((s, r) => s + total(r), 0))})`, lines: cobros.map((r) => `${r.counterparty || "Sin cliente"} · ${r.document || "sin documento"} · ${money(total(r))} · ${r.overdue} día(s) de atraso`) });
  if (pagos.length) sections.push({ title: `Pagos por vencer o vencidos (${pagos.length}, ${money(pagos.reduce((s, r) => s + total(r), 0))})`, lines: pagos.map((r) => `${r.counterparty || "Sin proveedor"} · ${r.document || "sin documento"} · ${money(total(r))} · ${r.days < 0 ? `vencido hace ${-r.days} día(s)` : r.days === 0 ? "vence hoy" : `vence en ${r.days} día(s)`}`) });
  if (vencidosShown.length) sections.push({ title: `Documentos regulatorios vencidos (${vencidosShown.length})`, lines: vencidosShown.map((d) => `${d.reference} (${d.kind}) · ${d.subject || "sin descripción"} · venció el ${d.expiresAt}`) });
  if (porVencer.length) sections.push({ title: `Documentos regulatorios por vencer (${porVencer.length})`, lines: porVencer.map((d) => `${d.reference} (${d.kind}) · ${d.subject || "sin descripción"} · vence el ${d.expiresAt} (${d.days === 0 ? "hoy" : `en ${d.days} día(s)`})`) });
  if (full && sinFecha) sections.push({ title: "Control pendiente", lines: [`${sinFecha} documento(s) regulatorios sin fecha de vencimiento.`] });

  const counts = { vencidos: vencidosShown.length, porVencer: porVencer.length, cobros: cobros.length, pagos: pagos.length, sinFecha };
  const head = [counts.cobros && `${counts.cobros} cobro(s) vencido(s)`, counts.pagos && `${counts.pagos} pago(s)`, counts.vencidos && `${counts.vencidos} documento(s) vencido(s)`, counts.porVencer && `${counts.porVencer} por vencer`].filter(Boolean).join(", ");
  const subject = `Volia Control · ${full ? "Informe semanal" : "Novedades"} del ${today}: ${head}`;
  const text = [`Volia Control · ${full ? "informe semanal" : "novedades del día"} (${today})`, "", ...sections.flatMap((s) => [s.title, ...s.lines.map((l) => `- ${l}`), ""]), `Abrir el sistema: ${appUrl}`].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2933"><h2 style="margin:0 0 12px">Volia Control · ${full ? "informe semanal" : "novedades del día"} (${today})</h2>${sections.map((s) => `<h3 style="margin:16px 0 6px">${esc(s.title)}</h3><ul style="margin:0;padding-left:18px">${s.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`).join("")}<p style="margin-top:18px"><a href="${esc(appUrl)}">Abrir el sistema</a></p></div>`;
  return { subject, text, html, counts };
}
