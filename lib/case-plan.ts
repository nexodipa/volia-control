// Seguimiento de casos de cirugía: qué toca hacer con cada expediente según su estado y los días transcurridos, y el
// borrador del mensaje a la institución. Funciones puras (sin red ni base de datos).
//
// Los casos se guardan solo en el dispositivo (llevan datos de pacientes) y no salen al resumen por correo. El borrador
// no incluye el nombre del paciente: identifica el caso por la factura y el contrato. Nunca se envía solo.
// Los plazos son criterios internos de Volia, no plazos legales ni de la institución.
import { daysUntil } from "./business-alerts.ts";
import { letterDate } from "./doc-templates.ts";
import { findResponsible, type InstitutionContact } from "./institution-contacts.ts";

export type CaseDocs = { letter: boolean; invoice: boolean; surgery: boolean; implants: boolean; signatures: boolean };
export type CasePlanRecord = {
  id: string; hospital: string; surgeryDate: string; contract: string; invoice: string; amount: number; paidAmount: number;
  submittedDate: string; dueDate: string; status: "surgery" | "documents" | "ready" | "submitted" | "review" | "observed" | "approved" | "paid";
  documents: CaseDocs;
};

export const DOC_LABELS: Record<keyof CaseDocs, string> = { letter: "carta de implantes", invoice: "factura o prefactura", surgery: "parte quirúrgico", implants: "detalle de implantes", signatures: "firmas y respaldos" };

/** Días desde la cirugía a partir de los cuales se avisa cada paso. */
export const DOCS_AFTER_DAYS = 5;
export const BILL_AFTER_DAYS = 3;
/** Días desde la presentación en que corresponde preguntar, insistir y pedir respuesta por escrito. */
export const FOLLOW_FROM_DAYS = { consulta: 15, insistencia: 30, escrito: 45 };

export type CaseKind = "observada" | "vencida" | "escrito" | "insistencia" | "consulta" | "facturar" | "documentos" | "fecha-pago";

export const KIND_LABEL: Record<CaseKind, string> = {
  observada: "con observaciones", vencida: "pago vencido", escrito: "sin respuesta, pedir por escrito", insistencia: "sin respuesta, insistir",
  consulta: "preguntar el estado", facturar: "lista para presentar", documentos: "documentos pendientes", "fecha-pago": "falta la fecha de pago",
};

const RANK: CaseKind[] = ["observada", "vencida", "escrito", "insistencia", "consulta", "facturar", "documentos", "fecha-pago"];

export type CaseStep = { id: string; kind: CaseKind; days: number; action: string; missing: string[]; drafts: boolean };

const since = (iso: string, today: string) => (iso ? -daysUntil(iso, today) : 0);

/** Siguiente paso de un caso, o null si no hay nada que hacer todavía (o ya está pagado). */
export function nextStep(rec: CasePlanRecord, today: string): CaseStep | null {
  if (rec.status === "paid" || (rec.amount > 0 && rec.paidAmount >= rec.amount)) return null;
  const missing = (Object.keys(DOC_LABELS) as (keyof CaseDocs)[]).filter((k) => !rec.documents[k]).map((k) => DOC_LABELS[k]);
  const sent = since(rec.submittedDate, today);
  const mk = (kind: CaseKind, days: number, action: string, drafts: boolean): CaseStep => ({ id: rec.id, kind, days, action, missing, drafts });
  if (rec.status === "observed") return mk("observada", sent, "Pedir el detalle de las observaciones, corregir y volver a presentar", true);
  if (rec.dueDate && daysUntil(rec.dueDate, today) < 0 && (rec.status === "submitted" || rec.status === "review" || rec.status === "approved")) return mk("vencida", -daysUntil(rec.dueDate, today), "Consultar la fecha real de pago", true);
  if ((rec.status === "submitted" || rec.status === "review") && rec.submittedDate) {
    if (sent >= FOLLOW_FROM_DAYS.escrito) return mk("escrito", sent, "Pedir respuesta por escrito y avisar a la jefatura", true);
    if (sent >= FOLLOW_FROM_DAYS.insistencia) return mk("insistencia", sent, "Insistir y pedir una fecha de respuesta", true);
    if (sent >= FOLLOW_FROM_DAYS.consulta) return mk("consulta", sent, "Preguntar en qué estado está la factura", true);
    return null;
  }
  if (rec.status === "approved") return rec.dueDate ? null : mk("fecha-pago", 0, "Pedir la fecha de pago y registrarla", true);
  const age = since(rec.surgeryDate, today);
  if (rec.status === "ready" && age >= BILL_AFTER_DAYS) return mk("facturar", age, "Presentar la factura", false);
  if ((rec.status === "documents" || rec.status === "surgery") && age >= DOCS_AFTER_DAYS) return mk("documentos", age, `Completar el expediente: falta ${missing.join(", ") || "revisar el checklist"}`, false);
  return null;
}

/** Pasos de todos los casos, los más urgentes primero y, dentro de cada tipo, los más antiguos. */
export function caseSteps(records: CasePlanRecord[], today: string): CaseStep[] {
  return records.map((r) => nextStep(r, today)).filter((s): s is CaseStep => !!s).sort((a, b) => RANK.indexOf(a.kind) - RANK.indexOf(b.kind) || b.days - a.days);
}

const usd = (n: number) => `USD ${n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export type CaseDraft = { to: string; contactName: string; subject: string; body: string };

/** Borrador a la institución. Sin nombre de paciente: se identifica por factura y contrato. null si el paso no lleva mensaje. */
export function caseDraft(rec: CasePlanRecord, step: CaseStep, today: string, contacts: InstitutionContact[] = []): CaseDraft | null {
  if (!step.drafts) return null;
  const contact = findResponsible(contacts, rec.hospital, rec.surgeryDate);
  const doc = rec.invoice.trim() || "sin número registrado";
  const ref = `factura ${doc}${rec.contract.trim() ? `, contrato o proceso ${rec.contract.trim()}` : ""}`;
  const pending = Math.max(0, rec.amount - rec.paidAmount);
  const amount = pending > 0 ? `, por ${usd(pending)}` : "";
  const sentOn = rec.submittedDate ? `, presentada el ${letterDate(rec.submittedDate)}` : "";
  const reply = letterDate(addDays(today, step.kind === "escrito" || step.kind === "insistencia" ? 5 : 7));
  const copy = "Si falta algún documento o dato de nuestra parte, avísenos y se lo enviamos de inmediato.";
  const core: Record<string, string[]> = {
    consulta: [`Le escribimos para consultar en qué estado se encuentra la ${ref}${amount}${sentOn}.`, `Le agradecemos indicarnos si ya fue revisada y la fecha prevista de pago. ${copy}`],
    insistencia: [`Nos comunicamos nuevamente por la ${ref}${amount}${sentOn}, que lleva ${step.days} días sin respuesta.`, `Le pedimos confirmarnos hasta el ${reply} el estado del trámite y la fecha prevista de pago. ${copy}`],
    escrito: [`La ${ref}${amount}${sentOn} lleva ${step.days} días sin respuesta.`, `Solicitamos que nos comuniquen por escrito, hasta el ${reply}, el estado del trámite y la fecha prevista de pago.`],
    vencida: [`La fecha prevista de pago de la ${ref}${amount} ya pasó (${step.days} día(s)).`, `Le agradecemos indicarnos la fecha en que se hará efectivo el pago o si hay algún trámite pendiente. ${copy}`],
    observada: [`Respecto a la ${ref}${amount}, tenemos registrado que fue observada.`, `Le pedimos enviarnos por escrito el detalle de las observaciones para corregirlas y volver a presentarla a la brevedad.`],
    "fecha-pago": [`La ${ref}${amount} figura como aprobada para pago.`, `Le agradecemos indicarnos la fecha en que se realizará el pago.`],
  };
  const lines = core[step.kind];
  if (!lines) return null;
  const subject = { consulta: "Consulta de estado", insistencia: "Seguimiento", escrito: "Solicitud de respuesta", vencida: "Fecha de pago", observada: "Observaciones", "fecha-pago": "Fecha de pago" }[step.kind as string] + `: factura ${doc}`;
  const hello = contact?.name ? `Estimado(a) ${contact.name}:` : `Estimados señores de ${rec.hospital.trim() || "[institución]"}:`;
  return { to: contact?.email ?? "", contactName: contact?.name ?? "", subject, body: [hello, "", ...lines.flatMap((p) => [p, ""]), "Atentamente,", "Volia S.A.S."].join("\n") };
}
