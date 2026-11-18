// Seguimiento de los procesos adjudicados a Volia: qué toca después de ganar (condiciones del contrato, entrega y
// factura) y cuándo avisar si todavía no se ve una factura a esa entidad. Funciones puras (sin red ni base de datos).
//
// Los tramos son criterios internos de Volia, no plazos legales: los plazos del contrato, las garantías y la entrega
// salen del pliego y del portal del SERCOP, que son la fuente oficial. Solo se siguen los procesos que tienen el día
// del resultado registrado (resultAt); los anteriores a ese registro no se avisan para no llenar el resumen con
// historia vieja. Si en Finanzas ya hay un ingreso a la misma entidad desde la adjudicación, se considera facturado.
import { daysUntil } from "./business-alerts.ts";
import { sameInstitution } from "./institution-contacts.ts";
import type { Tender } from "./tenders.ts";

export type AwardStage = "contrato" | "entrega" | "factura";

/** Días desde la adjudicación en que empieza cada gestión. */
export const AWARD_FROM_DAYS: Record<AwardStage, number> = { contrato: 3, entrega: 15, factura: 30 };
/** Pasado este tiempo ya no se avisa: lo que siga pendiente se revisa a mano. */
export const AWARD_UNTIL_DAYS = 120;
/** Martes a viernes solo avisa cuando se cumplen estos días desde la adjudicación. */
export const AWARD_MARKS = [3, 15, 30, 45, 60, 90];

export const AWARD_ACTION: Record<AwardStage, string> = {
  contrato: "revisar en el portal y en el pliego las condiciones del contrato y las garantías, y confirmar con la entidad los siguientes pasos",
  entrega: "coordinar con la entidad fechas y lugar de entrega, y revisar que producto, lotes y registros estén listos",
  factura: "sin factura a esta entidad en Finanzas desde la adjudicación: confirmar que se entregó y facturar, o registrar la factura",
};

/** Lo mismo para la pantalla de Procesos, que no mira Finanzas: el aviso del resumen sí revisa si ya hay factura. */
export const AWARD_ADVICE: Record<AwardStage, string> = {
  ...AWARD_ACTION,
  factura: "confirmar que se entregó y facturar; el resumen diario avisa mientras no vea una factura a esta entidad en Finanzas",
};

export function awardStage(days: number): AwardStage | null {
  if (days < AWARD_FROM_DAYS.contrato || days > AWARD_UNTIL_DAYS) return null;
  if (days >= AWARD_FROM_DAYS.factura) return "factura";
  if (days >= AWARD_FROM_DAYS.entrega) return "entrega";
  return "contrato";
}

/** Lo mínimo que se necesita de un registro de Finanzas para saber si ya se facturó a la entidad. */
export type AwardFinance = { direction: string; counterparty: string; date?: string };

const isoDay = (iso: string | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : "");

/** ¿Hay un ingreso a esa entidad desde el día de la adjudicación? Sin fecha en el ingreso se da por facturado (no molestar de más). */
export function invoicedSince(buyer: string, since: string, records: AwardFinance[]): boolean {
  if (!buyer.trim()) return false;
  return records.some((r) => {
    if (r.direction !== "income" || !sameInstitution(r.counterparty, buyer)) return false;
    const day = isoDay(r.date);
    return !day || day >= since;
  });
}

export type AwardFollowUp = { tender: Tender; awardedAt: string; days: number; stage: AwardStage };

/** Adjudicados que piden gestión y todavía sin factura. Lunes: todos. Martes a viernes: los que cumplen 3, 15, 30, 45, 60 o 90 días. */
export function awardFollowUps(tenders: Tender[], records: AwardFinance[], today: string, full: boolean): AwardFollowUp[] {
  const out: AwardFollowUp[] = [];
  for (const tender of tenders) {
    if (tender.status !== "won") continue;
    const awardedAt = isoDay(tender.resultAt);
    if (!awardedAt) continue;
    const days = -daysUntil(awardedAt, today);
    const stage = awardStage(days);
    if (!stage || !(full || AWARD_MARKS.includes(days))) continue;
    if (invoicedSince(tender.buyer, awardedAt, records)) continue;
    out.push({ tender, awardedAt, days, stage });
  }
  return out.sort((a, b) => b.days - a.days);
}

const usd = (n: number) => `USD ${n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const awardLine = (a: AwardFollowUp) =>
  `${a.tender.ref || "Proceso sin código"} · ${a.tender.buyer || "entidad no indicada"}${a.tender.ourPrice ? ` · ${usd(a.tender.ourPrice)}` : ""} · adjudicado hace ${a.days} día(s) · ${AWARD_ACTION[a.stage]}`;
