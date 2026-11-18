// Seguimiento de las ofertas ya presentadas: cuánto llevan sin resultado, qué conviene hacer en cada momento y el
// borrador de consulta a la entidad. Funciones puras (sin red ni base de datos). Los tramos son criterios internos
// de Volia, no plazos del SERCOP: el portal del SERCOP es siempre la fuente oficial del estado del proceso.
import { daysUntil } from "./business-alerts.ts";
import { letterDate } from "./doc-templates.ts";
import { findResponsible, type InstitutionContact } from "./institution-contacts.ts";
import type { Tender } from "./tenders.ts";

export type FollowStage = "portal" | "estado" | "entidad" | "cerrar";

/** Días desde la oferta en que empieza cada gestión. */
export const FOLLOW_FROM_DAYS: Record<FollowStage, number> = { portal: 7, estado: 15, entidad: 30, cerrar: 45 };

export const FOLLOW_ACTION: Record<FollowStage, string> = {
  portal: "revisar en el portal si hay aclaraciones o cambios de fecha",
  estado: "ver en el portal el estado y la fecha de adjudicación",
  entidad: "consultar a la entidad por el resultado",
  cerrar: "registrar el resultado (adjudicado o perdido) y el precio de cierre para afinar precios",
};

/** Días en que el resumen avisa de martes a viernes (el lunes se listan todas). Después de los 90, cada 30 días. */
const MARKS = [7, 15, 30, 45, 60, 90];
const isMark = (d: number) => MARKS.includes(d) || (d > 90 && (d - 90) % 30 === 0);

export function followStage(daysSinceOffer: number): FollowStage | null {
  if (daysSinceOffer < FOLLOW_FROM_DAYS.portal) return null;
  if (daysSinceOffer >= FOLLOW_FROM_DAYS.cerrar) return "cerrar";
  if (daysSinceOffer >= FOLLOW_FROM_DAYS.entidad) return "entidad";
  if (daysSinceOffer >= FOLLOW_FROM_DAYS.estado) return "estado";
  return "portal";
}

/** Fecha en que se presentó la oferta; si no se registró, la del día en que se empezó a seguir el proceso. */
export function offerDate(t: Pick<Tender, "offeredAt" | "createdAt">): string {
  return t.offeredAt || (/^\d{4}-\d{2}-\d{2}/.test(t.createdAt) ? t.createdAt.slice(0, 10) : "");
}

export type OfferFollowUp = { tender: Tender; offeredAt: string; days: number; stage: FollowStage };

export function offerFollowUps(tenders: Tender[], today: string, full: boolean): OfferFollowUp[] {
  const out: OfferFollowUp[] = [];
  for (const tender of tenders) {
    if (tender.status !== "offered") continue;
    const offeredAt = offerDate(tender);
    if (!offeredAt) continue;
    const days = -daysUntil(offeredAt, today);
    const stage = followStage(days);
    if (!stage || (!full && !isMark(days))) continue;
    out.push({ tender, offeredAt, days, stage });
  }
  return out.sort((a, b) => b.days - a.days);
}

export type StatusDraft = { to: string; contactName: string; subject: string; body: string };

/** Borrador para pedir a la entidad el estado de un proceso ofertado. Nunca se envía solo. */
export function statusDraft(t: Tender, today: string, contacts: InstitutionContact[] = []): StatusDraft | null {
  const offeredAt = offerDate(t);
  if (!offeredAt) return null;
  const contact = findResponsible(contacts, t.buyer, today);
  const hello = contact?.name ? `Estimado(a) ${contact.name}:` : `Estimados señores de ${t.buyer.trim() || "[entidad contratante]"}:`;
  const what = t.title ? `${t.ref} (${t.title.length > 160 ? `${t.title.slice(0, 160)}…` : t.title})` : t.ref;
  const body = [
    hello, "",
    `Volia S.A.S. presentó oferta en el proceso ${what} el ${letterDate(offeredAt)}.`, "",
    "Le agradeceríamos informarnos si ya se emitió la resolución de adjudicación o cuál es la fecha prevista para ello. Entendemos que las comunicaciones oficiales del proceso se realizan por el portal de compras públicas; esta consulta es solo para conocer el estado.", "",
    "Atentamente,", "Volia S.A.S.",
  ].join("\n");
  return { to: contact?.email ?? "", contactName: contact?.name ?? "", subject: `Consulta de estado del proceso ${t.ref}`, body };
}
