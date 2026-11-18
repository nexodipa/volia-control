// Seguimiento de cotizaciones enviadas: cuáles llevan días sin respuesta, qué toca hacer y el borrador del mensaje al
// cliente. Funciones puras (sin red ni base de datos) para poder probarlas.
//
// Solo se siguen las cotizaciones que la persona marcó como «enviada»: sin esa marca no se avisa nada, para no llenar el
// resumen con ofertas viejas. Los plazos son criterios internos de Volia, no plazos del cliente. El borrador nunca se
// envía solo y no lleva datos del paciente.
import { daysUntil } from "./business-alerts.ts";
import { letterDate } from "./doc-templates.ts";
import { findResponsible, type InstitutionContact } from "./institution-contacts.ts";

export type QuoteStatus = "sent" | "won" | "lost";
export type FollowQuote = {
  number: string; date: string; customer: string; total: number; status?: QuoteStatus; sentAt?: string;
  data?: { meta?: { validity?: number; contact?: string; hospital?: string } } | unknown;
};

/** Días desde el envío en que corresponde preguntar, insistir y pedir una decisión. */
export const FOLLOW_FROM_DAYS = { consulta: 5, insistencia: 10, decision: 20 };
/** Pasado este tiempo ya no se avisa: hay que marcarla como ganada o perdida. */
export const FOLLOW_UNTIL_DAYS = 90;
/** Martes a viernes solo avisa cuando se cumplen estos días desde el envío. */
export const FOLLOW_MARKS = [5, 10, 20, 30];

export type QuoteStage = "consulta" | "insistencia" | "decision";
export const STAGE_ACTION: Record<QuoteStage, string> = {
  consulta: "preguntar si pudieron revisarla",
  insistencia: "insistir y ofrecer aclarar precio, entrega o forma de pago",
  decision: "pedir una decisión o saber si ya no les interesa",
};

export function followStage(days: number): QuoteStage | null {
  if (days > FOLLOW_UNTIL_DAYS || days < FOLLOW_FROM_DAYS.consulta) return null;
  if (days >= FOLLOW_FROM_DAYS.decision) return "decision";
  if (days >= FOLLOW_FROM_DAYS.insistencia) return "insistencia";
  return "consulta";
}

const meta = (q: FollowQuote) => ((q.data as { meta?: { validity?: number; contact?: string; hospital?: string } } | undefined)?.meta ?? {});
const isoDay = (iso: string | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : "");

export type QuoteFollow<T extends FollowQuote = FollowQuote> = { quote: T; days: number; stage: QuoteStage };

/** Cotizaciones enviadas que ya piden gestión. Lunes: todas. Martes a viernes: solo las que cumplen 5, 10, 20 o 30 días. */
export function quoteFollowUps<T extends FollowQuote>(quotes: T[], today: string, full: boolean): QuoteFollow<T>[] {
  const out: QuoteFollow<T>[] = [];
  for (const q of quotes) {
    const sent = isoDay(q.sentAt);
    if (q.status !== "sent" || !sent) continue;
    const days = -daysUntil(sent, today);
    const stage = followStage(days);
    if (!stage || !(full || FOLLOW_MARKS.includes(days))) continue;
    out.push({ quote: q, days, stage });
  }
  return out.sort((a, b) => b.days - a.days);
}

const usd = (n: number) => `USD ${n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export const followLine = (f: QuoteFollow) => `${f.quote.number || "Oferta sin número"} · ${f.quote.customer || "cliente por definir"} · ${usd(f.quote.total)} · enviada hace ${f.days} día(s) · ${STAGE_ACTION[f.stage]}`;

export type QuoteDraft = { to: string; contactName: string; subject: string; body: string };

/** Borrador al cliente. Para una oferta enviada hace al menos 1 día; sin datos del paciente. */
export function quoteDraft(q: FollowQuote, today: string, contacts: InstitutionContact[] = []): QuoteDraft | null {
  const sent = isoDay(q.sentAt);
  if (!sent) return null;
  const days = -daysUntil(sent, today);
  const stage = followStage(days) ?? (days >= 1 ? "consulta" : null);
  if (!stage) return null;
  const m = meta(q);
  const contact = findResponsible(contacts, q.customer, today);
  const name = contact?.name || (m.contact ?? "").trim();
  const ref = `oferta ${q.number || "sin número"}${isoDay(q.date) ? ` del ${letterDate(isoDay(q.date))}` : ""} por ${usd(q.total)}`;
  const until = typeof m.validity === "number" && m.validity > 0 && isoDay(q.date) ? addDays(isoDay(q.date), m.validity) : "";
  const validity = until ? (until >= today ? ` Recuerde que tiene vigencia hasta el ${letterDate(until)}.` : ` La vigencia indicada (hasta el ${letterDate(until)}) ya pasó; si la necesita, la actualizamos.`) : "";
  const reply = letterDate(addDays(today, 5));
  const help = "Con gusto aclaramos precios, tiempos de entrega o forma de pago.";
  const core: Record<QuoteStage, string[]> = {
    consulta: [`Le escribimos para saber si pudo revisar nuestra ${ref}.${validity}`, help],
    insistencia: [`Nos comunicamos nuevamente por nuestra ${ref}, enviada hace ${days} días.${validity}`, `${help} Quedamos atentos a sus comentarios.`],
    decision: [`Nuestra ${ref} lleva ${days} días sin respuesta.${validity}`, `Le agradecemos indicarnos hasta el ${reply} si desea avanzar o si ya no es de su interés, para cerrar el seguimiento de nuestro lado. ${help}`],
  };
  const hello = name ? `Estimado(a) ${name}:` : `Estimados señores de ${q.customer.trim() || "[cliente]"}:`;
  const subject = `${{ consulta: "Consulta sobre", insistencia: "Seguimiento de", decision: "Respuesta sobre" }[stage]} oferta ${q.number || "sin número"}`;
  return { to: contact?.email ?? "", contactName: name, subject, body: [hello, "", ...core[stage].flatMap((p) => [p, ""]), "Atentamente,", "Volia S.A.S."].join("\n") };
}
