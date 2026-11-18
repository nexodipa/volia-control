// Cotizaciones del mes para el informe mensual: cuántas se enviaron, cuántas se ganaron o perdieron y cuántas siguen
// abiertas. Funciones puras. Solo cuenta lo que se marcó en el Cotizador (enviada, ganada, perdida): una oferta sin marca
// no aparece, y las ganadas o perdidas antes de que el sistema guardara el día de la decisión (decidedAt) tampoco.
import { daysUntil } from "./business-alerts.ts";

export type QuoteLogEntry = { number: string; customer: string; total: number; status: "sent" | "won" | "lost"; sentAt: string; decidedAt: string };

export type MonthQuotes = {
  sent: { count: number; total: number };
  won: { count: number; total: number };
  lost: { count: number; total: number };
  open: { count: number; total: number; stale: number };
  /** Ganadas sobre decididas del mes (0 a 1), o null si no hubo decisiones. */
  winRate: number | null;
  any: boolean;
};

/** Días abiertas desde los que se cuenta como «sin respuesta hace tiempo». Criterio interno de Volia. */
export const STALE_OPEN_DAYS = 30;

const round2 = (n: number) => Math.round(n * 100) / 100;
const inMonth = (iso: string, key: string) => /^\d{4}-\d{2}-\d{2}/.test(iso) && iso.slice(0, 7) === key;
const sum = (rows: QuoteLogEntry[]) => ({ count: rows.length, total: round2(rows.reduce((s, q) => s + q.total, 0)) });

export function monthQuotes(log: QuoteLogEntry[], key: string, today: string): MonthQuotes {
  const sent = sum(log.filter((q) => inMonth(q.sentAt, key)));
  const won = sum(log.filter((q) => q.status === "won" && inMonth(q.decidedAt, key)));
  const lost = sum(log.filter((q) => q.status === "lost" && inMonth(q.decidedAt, key)));
  const openRows = log.filter((q) => q.status === "sent");
  const stale = openRows.filter((q) => /^\d{4}-\d{2}-\d{2}/.test(q.sentAt) && -daysUntil(q.sentAt.slice(0, 10), today) >= STALE_OPEN_DAYS).length;
  const decided = won.count + lost.count;
  return {
    sent, won, lost,
    open: { ...sum(openRows), stale },
    winRate: decided ? won.count / decided : null,
    any: !!(sent.count || won.count || lost.count || openRows.length),
  };
}

const usd = (n: number) => `USD ${n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Líneas del informe; vacío si no hubo nada que contar. */
export function quoteLines(q: MonthQuotes): string[] {
  if (!q.any) return [];
  const lines = [`Enviadas en el mes: ${q.sent.count}${q.sent.count ? ` por ${usd(q.sent.total)}` : ""}`];
  if (q.won.count || q.lost.count) {
    lines.push(`Ganadas: ${q.won.count}${q.won.count ? ` (${usd(q.won.total)})` : ""} · Perdidas: ${q.lost.count}${q.lost.count ? ` (${usd(q.lost.total)})` : ""}${q.winRate === null ? "" : ` · ${Math.round(q.winRate * 100)} % de lo decidido se ganó`}`);
  }
  lines.push(`Siguen sin respuesta: ${q.open.count}${q.open.count ? ` por ${usd(q.open.total)}` : ""}${q.open.stale ? ` (${q.open.stale} con ${STALE_OPEN_DAYS} días o más)` : ""}`);
  lines.push("Solo cuenta lo marcado como enviada, ganada o perdida en el Cotizador.");
  return lines;
}
