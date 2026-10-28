// Informe mensual para gerencia: facturación y cobros del mes anterior, cartera vencida, principales clientes,
// procesos del SERCOP y vigencias. Funciones puras (sin red ni base de datos) para poder probarlas.
import type { DigestDoc, DigestFinance } from "./alert-digest.ts";
import { daysUntil } from "./business-alerts.ts";
import { tenderStats, type Tender } from "./tenders.ts";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const money = (n: number) => `USD ${n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const round2 = (n: number) => Math.round(n * 100) / 100;
const gross = (r: DigestFinance) => r.subtotal + r.iva;
const net = (r: DigestFinance) => r.subtotal + r.iva - r.withholding;

/** Primer día hábil (lunes a viernes) del mes de `today` (AAAA-MM-DD). */
export function isFirstBusinessDay(today: string): boolean {
  const d = new Date(`${today}T12:00:00Z`);
  const weekday = d.getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  for (let day = d.getUTCDate() - 1; day >= 1; day -= 1) {
    const w = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day, 12)).getUTCDay();
    if (w !== 0 && w !== 6) return false;
  }
  return true;
}

/** Ventana de envío: los primeros días hábiles del mes (hasta el 7), para poder reintentar si el primer día falló. */
export function inReportWindow(today: string): boolean {
  const d = new Date(`${today}T12:00:00Z`);
  const weekday = d.getUTCDay();
  return weekday >= 1 && weekday <= 5 && d.getUTCDate() <= 7;
}

/** Mes `back` meses antes del de `today`: clave AAAA-MM y nombre en español. */
export function monthBefore(today: string, back = 1): { key: string; label: string } {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7)) - 1 - back;
  const d = new Date(Date.UTC(y, m, 1));
  return { key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`, label: `${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}` };
}

export type AgingBucket = { label: string; amount: number; count: number };

export function agingBuckets(records: DigestFinance[], today: string): AgingBucket[] {
  const buckets: AgingBucket[] = [{ label: "1 a 30 días", amount: 0, count: 0 }, { label: "31 a 60 días", amount: 0, count: 0 }, { label: "61 a 90 días", amount: 0, count: 0 }, { label: "Más de 90 días", amount: 0, count: 0 }];
  for (const r of records) {
    if (r.direction !== "income" || r.status !== "pending" || !r.dueDate) continue;
    const late = -daysUntil(r.dueDate, today);
    if (late < 1) continue;
    const b = buckets[late <= 30 ? 0 : late <= 60 ? 1 : late <= 90 ? 2 : 3];
    b.amount = round2(b.amount + net(r)); b.count += 1;
  }
  return buckets;
}

export type MonthFinance = { billed: number; collected: number; pending: number; expenses: number; expensesPaid: number; result: number; count: number };

export function monthFinance(records: DigestFinance[], key: string): MonthFinance {
  const inMonth = records.filter((r) => (r.date ?? "").startsWith(key));
  const income = inMonth.filter((r) => r.direction === "income");
  const expense = inMonth.filter((r) => r.direction === "expense");
  const sum = (list: DigestFinance[], f: (r: DigestFinance) => number) => round2(list.reduce((s, r) => s + f(r), 0));
  return {
    billed: sum(income, gross), collected: sum(income.filter((r) => r.status === "paid"), net), pending: sum(income.filter((r) => r.status === "pending"), net),
    expenses: sum(expense, gross), expensesPaid: sum(expense.filter((r) => r.status === "paid"), gross), result: round2(sum(income, r => r.subtotal) - sum(expense, r => r.subtotal)), count: inMonth.length,
  };
}

export function topClients(records: DigestFinance[], key: string, limit = 5) {
  const by = new Map<string, number>();
  for (const r of records) if (r.direction === "income" && (r.date ?? "").startsWith(key)) by.set(r.counterparty || "Sin cliente", round2((by.get(r.counterparty || "Sin cliente") ?? 0) + gross(r)));
  return [...by.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, limit);
}

export type MonthlyReport = { subject: string; text: string; html: string; monthKey: string };

function barRows(rows: { label: string; value: number; display: string }[], color: string) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<table role="presentation" style="width:100%;border-collapse:collapse;table-layout:fixed"><colgroup><col style="width:34%"><col style="width:40%"><col style="width:26%"></colgroup>${rows.map((r) => `<tr><td style="padding:3px 8px 3px 0;font-size:13px;overflow-wrap:anywhere">${esc(r.label)}</td><td style="padding:3px 0"><div style="background:#e8efec;border-radius:4px;height:12px"><div style="background:${color};border-radius:4px;height:12px;width:${r.value > 0 ? Math.max(2, Math.round((r.value / max) * 100)) : 0}%"></div></div></td><td style="padding:3px 0 3px 8px;text-align:right;font-size:13px;white-space:nowrap">${esc(r.display)}</td></tr>`).join("")}</table>`;
}

export function buildMonthlyReport(input: { records: DigestFinance[]; tenders: Tender[]; docs: DigestDoc[] }, today: string, appUrl: string): MonthlyReport | null {
  const month = monthBefore(today, 1), before = monthBefore(today, 2);
  const cur = monthFinance(input.records, month.key), prev = monthFinance(input.records, before.key);
  if (!cur.count && !prev.count && !input.tenders.length) return null;

  const change = prev.billed > 0 ? Math.round(((cur.billed - prev.billed) / prev.billed) * 100) : null;
  const aging = agingBuckets(input.records, today);
  const overdueTotal = round2(aging.reduce((s, b) => s + b.amount, 0));
  const clients = topClients(input.records, month.key);
  const stats = tenderStats(input.tenders);
  const docsDated = input.docs.filter((d) => d.expiresAt).map((d) => daysUntil(d.expiresAt as string, today));
  const docsExpired = docsDated.filter((d) => d < 0).length, docsSoon = docsDated.filter((d) => d >= 0 && d <= 90).length;

  const lines = [
    `Informe de ${month.label}`,
    "",
    "Facturación y cobros",
    `- Facturado: ${money(cur.billed)}${change === null ? "" : ` (${change >= 0 ? "+" : ""}${change} % frente a ${before.label})`}`,
    `- Cobrado: ${money(cur.collected)} · Por cobrar: ${money(cur.pending)}`,
    `- Egresos: ${money(cur.expenses)} (pagado ${money(cur.expensesPaid)})`,
    `- Resultado del mes (sin IVA): ${money(cur.result)}`,
    "",
    `Cartera vencida al ${today}: ${money(overdueTotal)}`,
    ...aging.filter((b) => b.count).map((b) => `- ${b.label}: ${money(b.amount)} (${b.count})`),
    "",
    ...(clients.length ? ["Principales clientes del mes", ...clients.map((c) => `- ${c.name}: ${money(c.amount)}`), ""] : []),
    "Procesos del SERCOP",
    `- ${stats.open} abierto(s) por ${money(stats.inPlay)} de presupuesto · ${stats.winRate === null ? "aún sin resultados" : `tasa de éxito ${Math.round(stats.winRate * 100)} % (${stats.byStatus.won} de ${stats.decided})`}`,
    "",
    `Registros sanitarios: ${docsExpired} vencido(s), ${docsSoon} por vencer en 90 días`,
    "",
    `Abrir el sistema: ${appUrl}`,
  ];

  const kpi = (label: string, value: string) => `<td style="padding:10px 14px;background:#f3f7f5;border-radius:8px"><div style="font-size:12px;color:#5f716d">${esc(label)}</div><div style="font-size:18px;font-weight:700">${esc(value)}</div></td>`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2933;max-width:640px">
<h2 style="margin:0 0 4px">Informe de ${esc(month.label)}</h2><p style="margin:0 0 14px;color:#5f716d">Volia Control · generado el ${esc(today)}</p>
<table role="presentation" style="border-spacing:8px 0;margin:0 -8px 8px"><tr>${kpi("Facturado", money(cur.billed))}${kpi("Cobrado", money(cur.collected))}${kpi("Por cobrar", money(cur.pending))}</tr></table>
${change === null ? "" : `<p style="margin:4px 0 14px;color:#5f716d">${change >= 0 ? "Subió" : "Bajó"} ${Math.abs(change)} % frente a ${esc(before.label)}. Egresos ${esc(money(cur.expenses))}; resultado sin IVA ${esc(money(cur.result))}.</p>`}
<h3 style="margin:18px 0 6px">Cartera vencida: ${esc(money(overdueTotal))}</h3>${aging.some((b) => b.count) ? barRows(aging.map((b) => ({ label: b.label, value: b.amount, display: `${money(b.amount)} (${b.count})` })), "#e4583e") : '<p style="color:#5f716d;margin:0">No hay cobros vencidos.</p>'}
${clients.length ? `<h3 style="margin:18px 0 6px">Principales clientes del mes</h3>${barRows(clients.map((c) => ({ label: c.name, value: c.amount, display: money(c.amount) })), "#1b7a66")}` : ""}
<h3 style="margin:18px 0 6px">Procesos del SERCOP</h3><p style="margin:0">${stats.open} abierto(s) por ${esc(money(stats.inPlay))} de presupuesto. ${stats.winRate === null ? "Aún sin resultados registrados." : `Tasa de éxito ${Math.round(stats.winRate * 100)} % (${stats.byStatus.won} de ${stats.decided} resueltos).`}</p>
<h3 style="margin:18px 0 6px">Registros sanitarios</h3><p style="margin:0">${docsExpired} vencido(s) y ${docsSoon} por vencer en los próximos 90 días.</p>
<p style="margin-top:20px"><a href="${esc(appUrl)}">Abrir el sistema</a></p></div>`;

  return { subject: `Volia Control · Informe de ${month.label}: facturado ${money(cur.billed)}, cobrado ${money(cur.collected)}`, text: lines.join("\n"), html, monthKey: month.key };
}
