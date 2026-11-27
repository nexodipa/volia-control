// Resumen de alertas por correo: reglas puras (sin base de datos ni red) para poder probarlas.
// Lunes: informe completo. Martes a viernes: solo novedades (umbrales que se cruzan ese día).
import { daysUntil, expiryStatus } from "./business-alerts.ts";
import { deadlineReminders, type Tender } from "./tenders.ts";
import type { MailRecord } from "./mail-sync.ts";
import { MAIL_CATEGORIES } from "./mail-triage.ts";
import { weeklyRecap } from "./weekly-recap.ts";
import { stockDigest, type PlanItem, type PlanMove } from "./stock-plan.ts";
import { quoteFollowUps, followLine, type FollowQuote } from "./quote-followup.ts";
import { awardFollowUps, awardLine } from "./award-followup.ts";
import { cashOutlook } from "./cash-outlook.ts";
import { FOLLOW_ACTION, offerFollowUps } from "./offer-followup.ts";
import { collectionStage, STAGE_ACTION } from "./collection-plan.ts";
import { earlyRenewals, holderOf, renewalLine } from "./renewal-plan.ts";
import { sriDigest } from "./sri-calendar.ts";

export type DigestDoc = { reference: string; kind: string; subject: string; expiresAt: string | null; items?: string };
export type DigestFinance = {
  direction: "income" | "expense";
  status: "paid" | "pending";
  dueDate: string;
  /** Fecha de emisión (AAAA-MM-DD); la usa el informe mensual. */
  date?: string;
  counterparty: string;
  document: string;
  subtotal: number;
  iva: number;
  withholding: number;
  /** Día en que se marcó cobrado o pagado (AAAA-MM-DD); lo usa el resumen semanal. */
  paidAt?: string;
};
export type Digest = { subject: string; text: string; html: string; counts: { vencidos: number; porVencer: number; cobros: number; pagos: number; sinFecha: number; procesos: number; correo: number; renovaciones: number; ofertas: number; semana: number; inventario: number; reposicion: number; cotizaciones: number; adjudicados: number; caja: number; sri: number } };

/** Fecha de hoy en Ecuador (UTC-5, sin horario de verano). */
export function ecuadorToday(now = new Date()): string {
  return new Date(now.getTime() - 5 * 3_600_000).toISOString().slice(0, 10);
}
export function isMonday(today: string): boolean {
  return new Date(`${today}T12:00:00Z`).getUTCDay() === 1;
}

const DOC_THRESHOLDS = [90, 60, 30, 15, 7, 3, 0];
const OVERDUE_MARKS = [1, 7, 15, 30, 60, 90];
const stageNote = (overdue: number) => { const st = collectionStage(overdue); return st ? ` · ${STAGE_ACTION[st]}` : ""; };
const money = (n: number) => `USD ${n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const total = (r: DigestFinance) => Math.round((r.subtotal + r.iva - r.withholding) * 100) / 100;

/** Correos nuevos sin revisar. Lunes: todos con sus plazos de la semana. Martes a viernes: los llegados desde ayer y los plazos que cumplen 3, 1 o 0 días. */
export function mailDigest(mail: MailRecord[], today: string, full: boolean): { total: number; lines: string[] } {
  const pending = mail.filter((m) => m.status === "nuevo");
  const yesterday = new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const recent = (m: MailRecord) => ecuadorToday(new Date(m.syncedAt)) >= yesterday;
  const days = (m: MailRecord) => (m.fields.deadline ? daysUntil(m.fields.deadline, today) : null);
  const urgent = pending.filter((m) => { const d = days(m); return d !== null && (full ? d <= 7 : d === 3 || d === 1 || d === 0); });
  const fresh = full ? pending : pending.filter(recent);
  const shown = new Set([...urgent, ...fresh]);
  if (!shown.size) return { total: 0, lines: [] };

  const byCat = new Map<string, number>();
  for (const m of fresh) byCat.set(MAIL_CATEGORIES[m.category].label, (byCat.get(MAIL_CATEGORIES[m.category].label) ?? 0) + 1);
  const lines: string[] = [];
  if (byCat.size) lines.push(`${full ? "Por revisar" : "Llegaron"}: ${[...byCat].map(([label, n]) => `${n} de ${label}`).join(", ")}`);
  const newProcesses = fresh.filter((m) => m.category === "sercop" && m.fields.processCodes.length).length;
  if (newProcesses) lines.push(`${newProcesses} correo(s) del SERCOP con proceso: ya están en Procesos como «Por revisar»`);
  const detail = [...urgent].sort((a, b) => (days(a) ?? 99) - (days(b) ?? 99)).slice(0, 8);
  for (const m of detail) {
    const d = days(m) ?? 0;
    lines.push(`${m.subject || "(sin asunto)"} · ${m.from.name || m.from.email} · ${d < 0 ? `plazo vencido hace ${-d} día(s)` : d === 0 ? "plazo hoy" : `plazo en ${d} día(s) (${m.fields.deadline})`}`);
  }
  return { total: shown.size, lines };
}

export function buildDigest(docs: DigestDoc[], records: DigestFinance[], today: string, appUrl: string, tenders: Tender[] = [], mail: MailRecord[] = [], stock: { items: PlanItem[]; moves: PlanMove[] } = { items: [], moves: [] }, quotes: FollowQuote[] = [], sriRuc: string | null = null): Digest | null {
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

  const procesos = deadlineReminders(tenders, today, full);
  const correo = mailDigest(mail, today, full);
  const renovar = earlyRenewals(docs, today, full);
  const ofertas = offerFollowUps(tenders, today, full);
  const cotizar = quoteFollowUps(quotes, today, full);
  const adjudicados = awardFollowUps(tenders, records, today, full);
  const inv = stockDigest(stock.items, stock.moves, today, full);
  const semana = full ? weeklyRecap(tenders, records, today) : { total: 0, lines: [] as string[] };
  const sri = sriRuc ? sriDigest(sriRuc, today, full) : { total: 0, lines: [] as string[] };

  if (!vencidosShown.length && !porVencer.length && !renovar.length && !ofertas.length && !cotizar.length && !adjudicados.length && !inv.expiry.total && !inv.reorder.total && !semana.total && !cobros.length && !pagos.length && !procesos.length && !correo.total && !sri.total) return null;

  const sections: { title: string; lines: string[] }[] = [];
  if (cobros.length) sections.push({ title: `Cobros vencidos (${cobros.length}, ${money(cobros.reduce((s, r) => s + total(r), 0))})`, lines: cobros.map((r) => `${r.counterparty || "Sin cliente"} · ${r.document || "sin documento"} · ${money(total(r))} · ${r.overdue} día(s) de atraso${stageNote(r.overdue)}`) });
  if (pagos.length) sections.push({ title: `Pagos por vencer o vencidos (${pagos.length}, ${money(pagos.reduce((s, r) => s + total(r), 0))})`, lines: pagos.map((r) => `${r.counterparty || "Sin proveedor"} · ${r.document || "sin documento"} · ${money(total(r))} · ${r.days < 0 ? `vencido hace ${-r.days} día(s)` : r.days === 0 ? "vence hoy" : `vence en ${r.days} día(s)`}`) });
  if (procesos.length) sections.push({ title: `Procesos del SERCOP con fecha límite cercana (${procesos.length})`, lines: procesos.map((p) => `${p.ref}${p.buyer ? ` · ${p.buyer}` : ""} · ${p.status === "preparing" ? "oferta en preparación" : "aún sin ofertar"} · ${p.days < 0 ? `la fecha límite pasó hace ${-p.days} día(s)` : p.days === 0 ? "vence hoy" : `vence en ${p.days} día(s) (${p.deadline})`}`) });
  if (sri.total) sections.push({ title: "SRI: declaración mensual", lines: sri.lines });
  if (correo.total) sections.push({ title: `Correo (${correo.total})`, lines: correo.lines });
  if (vencidosShown.length) sections.push({ title: `Documentos regulatorios vencidos (${vencidosShown.length})`, lines: vencidosShown.map((d) => `${d.reference} (${d.kind}) · ${d.subject || "sin descripción"} · venció el ${d.expiresAt}`) });
  if (porVencer.length) sections.push({ title: `Documentos regulatorios por vencer (${porVencer.length})`, lines: porVencer.map((d) => { const h = holderOf(d); return `${d.reference} (${d.kind}) · ${d.subject || "sin descripción"} · vence el ${d.expiresAt} (${d.days === 0 ? "hoy" : `en ${d.days} día(s)`})${h ? ` · pedir a ${h}` : ""}`; }) });
  if (ofertas.length) sections.push({ title: `Ofertas presentadas por seguir (${ofertas.length})`, lines: ofertas.map((o) => `${o.tender.ref} · ${o.tender.buyer || "entidad no indicada"} · presentada hace ${o.days} día(s) · ${FOLLOW_ACTION[o.stage]}`) });
  if (adjudicados.length) sections.push({ title: `Adjudicados por gestionar (${adjudicados.length})`, lines: [...adjudicados.map(awardLine), "Son criterios internos de Volia; los plazos del contrato y de la entrega los fija el pliego y el portal del SERCOP."] });
  if (cotizar.length) sections.push({ title: `Cotizaciones enviadas sin respuesta (${cotizar.length})`, lines: [...cotizar.map(followLine), "En el Cotizador, Memoria Volia, «Redactar seguimiento» arma el borrador del mensaje."] });
  if (inv.expiry.total) sections.push({ title: `Inventario por caducar (${inv.expiry.total}${inv.expiry.value > 0 ? `, ${money(inv.expiry.value)} a costo` : ""})`, lines: inv.expiry.lines });
  if (inv.reorder.total) sections.push({ title: `Reposición sugerida (${inv.reorder.total})`, lines: [...inv.reorder.lines, "En Inventario, «Lista de reposición» la deja lista para copiar. Son cantidades orientativas."] });
  if (renovar.length) sections.push({ title: `Renovaciones por iniciar (${renovar.length})`, lines: [...renovar.map(renewalLine), "En Vigencias, el botón «Pedir renovación» arma el borrador del correo."] });
  if (full && sinFecha) sections.push({ title: "Control pendiente", lines: [`${sinFecha} documento(s) regulatorios sin fecha de vencimiento.`] });

  // La caja de las próximas semanas solo acompaña al resto: no basta para enviar un correo por sí sola.
  const caja = full && sections.length ? cashOutlook(records, today) : { total: 0, lines: [] as string[], tight: 0 };
  if (caja.total) sections.push({ title: `Caja de las próximas 4 semanas${caja.tight ? ` (${caja.tight} con saldo negativo)` : ""}`, lines: caja.lines });
  if (semana.total) sections.push({ title: "La semana pasada", lines: semana.lines });
  // «Lo primero»: lo que no puede esperar al resto del correo, en una línea por tema y sin repetir el detalle de abajo.
  const first: string[] = [];
  const closing = procesos.filter((p) => p.days <= 1);
  if (closing.length) first.push(`${closing.length} proceso(s) del SERCOP con fecha límite hoy o mañana: ${closing.slice(0, 3).map((p) => p.ref).join(", ")}${closing.length > 3 ? " y más" : ""}`);
  const payNow = pagos.filter((r) => r.days <= 0);
  if (payNow.length) first.push(`${payNow.length} pago(s) vencen hoy o ya vencieron (${money(payNow.reduce((s, r) => s + total(r), 0))})`);
  const lateCharges = cobros.filter((r) => r.overdue >= 30);
  if (lateCharges.length) first.push(`${lateCharges.length} cobro(s) con 30 días o más de mora (${money(lateCharges.reduce((s, r) => s + total(r), 0))})`);
  if (vencidosShown.length) first.push(`${vencidosShown.length} documento(s) regulatorio(s) vencido(s)`);
  if (inv.reorder.agotados) first.push(`${inv.reorder.agotados} producto(s) agotado(s) que se estaban vendiendo`);
  if (first.length && sections.length - (caja.total ? 1 : 0) >= 3) sections.unshift({ title: "Lo primero", lines: first.slice(0, 5) });

  const counts = { vencidos: vencidosShown.length, porVencer: porVencer.length, cobros: cobros.length, pagos: pagos.length, sinFecha, procesos: procesos.length, correo: correo.total, renovaciones: renovar.length, ofertas: ofertas.length, semana: semana.total, inventario: inv.expiry.total, reposicion: inv.reorder.total, cotizaciones: cotizar.length, adjudicados: adjudicados.length, caja: caja.total, sri: sri.total };
  const head = [counts.cobros && `${counts.cobros} cobro(s) vencido(s)`, counts.pagos && `${counts.pagos} pago(s)`, counts.vencidos && `${counts.vencidos} documento(s) vencido(s)`, counts.porVencer && `${counts.porVencer} por vencer`, counts.procesos && `${counts.procesos} proceso(s) por ofertar`, counts.sri && "declaración del SRI", counts.correo && `${counts.correo} correo(s)`, counts.renovaciones && `${counts.renovaciones} renovación(es) por iniciar`, counts.ofertas && `${counts.ofertas} oferta(s) por seguir`, counts.adjudicados && `${counts.adjudicados} adjudicado(s) por gestionar`, counts.cotizaciones && `${counts.cotizaciones} cotización(es) sin respuesta`, counts.inventario && `${counts.inventario} lote(s) por caducar`, counts.reposicion && `${counts.reposicion} producto(s) por reponer`].filter(Boolean) as string[];
  const headText = head.length > 4 ? `${head.slice(0, 4).join(", ")} y ${head.length - 4} más` : head.join(", ");
  const subject = `Volia Control · ${full ? "Informe semanal" : "Novedades"} del ${today}: ${headText}`;
  const text = [`Volia Control · ${full ? "informe semanal" : "novedades del día"} (${today})`, "", ...sections.flatMap((s) => [s.title, ...s.lines.map((l) => `- ${l}`), ""]), `Abrir el sistema: ${appUrl}`].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2933"><h2 style="margin:0 0 12px">Volia Control · ${full ? "informe semanal" : "novedades del día"} (${today})</h2>${sections.map((s) => `<h3 style="margin:16px 0 6px">${esc(s.title)}</h3><ul style="margin:0;padding-left:18px">${s.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>`).join("")}<p style="margin-top:18px"><a href="${esc(appUrl)}">Abrir el sistema</a></p></div>`;
  return { subject, text, html, counts };
}
