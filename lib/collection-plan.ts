// Cobranza escalonada: según los días de mora, qué tipo de gestión toca y el borrador del recordatorio al cliente.
// Funciones puras (sin red ni base de datos). El borrador nunca se envía solo: la persona lo revisa y lo manda.
import { daysUntil } from "./business-alerts.ts";
import { letterDate } from "./doc-templates.ts";
import { findResponsible, type InstitutionContact } from "./institution-contacts.ts";

export type CollectionRecord = { counterparty: string; document: string; dueDate: string; subtotal: number; iva: number; withholding: number };

export type CollectionStage = "amable" | "seguimiento" | "insistencia" | "formal";

/** Días de mora desde los que corresponde cada gestión. Son criterios internos de Volia, no plazos legales. */
export const STAGE_FROM_DAYS: Record<CollectionStage, number> = { amable: 1, seguimiento: 15, insistencia: 30, formal: 60 };

export const STAGE_LABEL: Record<CollectionStage, string> = { amable: "recordatorio amable", seguimiento: "seguimiento", insistencia: "insistencia", formal: "gestión formal" };

export const STAGE_ACTION: Record<CollectionStage, string> = {
  amable: "recordatorio por correo",
  seguimiento: "correo y llamada para confirmar fecha de pago",
  insistencia: "pedir fecha de pago comprometida",
  formal: "carta formal y revisar con el contador o un asesor",
};

export function collectionStage(daysOverdue: number): CollectionStage | null {
  if (daysOverdue < STAGE_FROM_DAYS.amable) return null;
  if (daysOverdue >= STAGE_FROM_DAYS.formal) return "formal";
  if (daysOverdue >= STAGE_FROM_DAYS.insistencia) return "insistencia";
  if (daysOverdue >= STAGE_FROM_DAYS.seguimiento) return "seguimiento";
  return "amable";
}

/** Total a cobrar: subtotal + IVA − retenciones, en dólares con centavos. */
export const collectionTotal = (r: Pick<CollectionRecord, "subtotal" | "iva" | "withholding">) => Math.round((r.subtotal + r.iva - r.withholding) * 100) / 100;

export const usd = (n: number) => `USD ${n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export type CollectionDraft = { to: string; contactName: string; stage: CollectionStage; subject: string; body: string };

/** Borrador para una cuenta por cobrar vencida; null si todavía no está vencida. */
export function collectionDraft(rec: CollectionRecord, today: string, contacts: InstitutionContact[] = []): CollectionDraft | null {
  const overdue = -daysUntil(rec.dueDate, today);
  const stage = collectionStage(overdue);
  if (!stage) return null;
  const contact = findResponsible(contacts, rec.counterparty, today);
  const doc = rec.document.trim() || "pendiente";
  const amount = usd(collectionTotal(rec));
  const due = letterDate(rec.dueDate);
  const reply = letterDate(addDays(today, stage === "formal" || stage === "insistencia" ? 5 : 7));
  const copy = "Si necesita una copia del documento o falta algún dato de nuestra parte para procesar el pago, avísenos y se lo enviamos de inmediato.";
  const core: Record<CollectionStage, string[]> = {
    amable: [
      `Le escribimos para recordarle que la factura ${doc} por ${amount} venció el ${due}.`,
      "Es posible que el pago ya esté en trámite; si es así, le agradecemos confirmarnos la fecha prevista.",
      copy,
    ],
    seguimiento: [
      `La factura ${doc} por ${amount} venció el ${due} y lleva ${overdue} días pendiente.`,
      `Le agradecemos indicarnos la fecha en que se realizará el pago o si hay algún trámite pendiente que debamos atender. Quedamos atentos a su respuesta hasta el ${reply}.`,
      copy,
    ],
    insistencia: [
      `Es nuestro segundo aviso por la factura ${doc} por ${amount}, vencida el ${due} (${overdue} días).`,
      `Le pedimos confirmarnos hasta el ${reply} la fecha comprometida de pago. Si hay alguna observación sobre el documento, necesitamos conocerla para resolverla.`,
      copy,
    ],
    formal: [
      `Mantenemos pendiente la factura ${doc} por ${amount}, vencida el ${due}, es decir, hace ${overdue} días.`,
      `Solicitamos regularizar el pago o comunicarnos por escrito la fecha de pago hasta el ${reply}. De no recibir respuesta, evaluaremos los siguientes pasos de cobranza.`,
      copy,
    ],
  };
  const subject = { amable: "Recordatorio de pago", seguimiento: "Seguimiento de pago", insistencia: "Segundo aviso de pago", formal: "Requerimiento de pago" }[stage] + `: factura ${doc}`;
  const hello = contact?.name ? `Estimado(a) ${contact.name}:` : `Estimados señores de ${rec.counterparty.trim() || "[cliente]"}:`;
  const body = [hello, "", ...core[stage].flatMap((p) => [p, ""]), "Atentamente,", "Volia S.A.S."].join("\n");
  return { to: contact?.email ?? "", contactName: contact?.name ?? "", stage, subject, body };
}
