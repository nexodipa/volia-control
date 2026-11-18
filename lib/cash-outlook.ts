// Caja de las próximas semanas (se muestra en el resumen del lunes): cuánto se espera cobrar y pagar cada semana según
// las fechas de vencimiento de Finanzas, y en qué semanas los pagos superan lo que se espera cobrar. Funciones puras.
//
// Es una vista de lo registrado, no una predicción: un cobro entra cuando el cliente paga, que suele ser después del
// vencimiento, y por eso los cobros ya vencidos no se suman a ninguna semana, solo se nombran aparte. No incluye el saldo
// de caja: solo mira los movimientos pendientes.
import { daysUntil } from "./business-alerts.ts";
import type { DigestFinance } from "./alert-digest.ts";

export const OUTLOOK_WEEKS = 4;

const usd = (n: number) => `USD ${n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const net = (r: Pick<DigestFinance, "subtotal" | "iva" | "withholding">) => Math.round((r.subtotal + r.iva - r.withholding) * 100) / 100;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const short = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export type OutlookWeek = { from: string; to: string; income: number; expense: number; balance: number; items: number };
export type CashOutlook = { total: number; lines: string[]; tight: number; weeks: OutlookWeek[]; overdueIncome: number };

/** Pendientes agrupados por semana (la primera empieza hoy) y la suma de lo que ya venció sin cobrar. */
export function cashOutlook(records: DigestFinance[], today: string, weeks = OUTLOOK_WEEKS): CashOutlook {
  const pending = records.filter((r) => r.status === "pending" && /^\d{4}-\d{2}-\d{2}/.test(r.dueDate ?? ""));
  const out: OutlookWeek[] = [];
  for (let i = 0; i < weeks; i++) {
    const start = i * 7, end = start + 6;
    const inRange = pending.filter((r) => { const d = daysUntil(r.dueDate.slice(0, 10), today); return d >= start && d <= end; });
    const income = Math.round(inRange.filter((r) => r.direction === "income").reduce((s, r) => s + net(r), 0) * 100) / 100;
    const expense = Math.round(inRange.filter((r) => r.direction === "expense").reduce((s, r) => s + net(r), 0) * 100) / 100;
    out.push({ from: addDays(today, start), to: addDays(today, end), income, expense, balance: Math.round((income - expense) * 100) / 100, items: inRange.length });
  }
  const overdueIncome = Math.round(pending.filter((r) => r.direction === "income" && daysUntil(r.dueDate.slice(0, 10), today) < 0).reduce((s, r) => s + net(r), 0) * 100) / 100;
  const withMoves = out.filter((w) => w.items > 0);
  if (!withMoves.length) return { total: 0, lines: [], tight: 0, weeks: out, overdueIncome };

  const lines = out.filter((w) => w.items > 0).map((w) => {
    const sign = w.balance < 0 ? "−" : "+";
    const note = w.balance < 0 ? " · los pagos superan lo que se espera cobrar" : "";
    return `Del ${short(w.from)} al ${short(w.to)}: por cobrar ${usd(w.income)}, por pagar ${usd(w.expense)}, saldo ${sign}${usd(Math.abs(w.balance))}${note}`;
  });
  if (overdueIncome > 0) lines.push(`Aparte: ${usd(overdueIncome)} en cobros ya vencidos que no se cuentan en ninguna semana`);
  lines.push("Solo suma lo pendiente en Finanzas según su fecha de vencimiento; no incluye el saldo de caja ni lo que no esté registrado.");
  return { total: withMoves.length, lines, tight: withMoves.filter((w) => w.balance < 0).length, weeks: out, overdueIncome };
}
