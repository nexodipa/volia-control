// Qué pasó la semana anterior (se muestra en el resumen del lunes): ofertas presentadas, resultados de procesos,
// cobros y pagos hechos. Funciones puras (sin red ni base de datos). Solo cuenta lo que tiene fecha registrada:
// los resultados y pagos anteriores a esta función no la tienen y no aparecen.
import { tenderStats, type Tender } from "./tenders.ts";
import type { DigestFinance } from "./alert-digest.ts";

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const usd = (n: number) => `USD ${n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const net = (r: Pick<DigestFinance, "subtotal" | "iva" | "withholding">) => Math.round((r.subtotal + r.iva - r.withholding) * 100) / 100;

export type WeeklyRecap = { total: number; lines: string[] };

/** Los 7 días anteriores a `today` (de hace 7 días a ayer, ambos incluidos). */
export function weeklyRecap(tenders: Tender[], records: DigestFinance[], today: string): WeeklyRecap {
  const from = addDays(today, -7), to = addDays(today, -1);
  const inWeek = (d: string | undefined) => !!d && /^\d{4}-\d{2}-\d{2}/.test(d) && d.slice(0, 10) >= from && d.slice(0, 10) <= to;
  const lines: string[] = [];

  const started = tenders.filter((t) => inWeek(t.createdAt)).length;
  if (started) lines.push(`${started} proceso(s) nuevos en seguimiento`);

  const offered = tenders.filter((t) => inWeek(t.offeredAt));
  if (offered.length) lines.push(`Ofertas presentadas (${offered.length}): ${offered.map((t) => `${t.ref}${t.buyer ? ` (${t.buyer})` : ""}`).join("; ")}`);

  const results = tenders.filter((t) => (t.status === "won" || t.status === "lost") && inWeek(t.resultAt));
  for (const t of results) {
    const price = t.ourPrice || t.amount;
    lines.push(t.status === "won"
      ? `Adjudicado a Volia: ${t.ref}${t.buyer ? ` (${t.buyer})` : ""}${price ? ` · ${usd(price)}` : ""}`
      : `Perdido: ${t.ref}${t.buyer ? ` (${t.buyer})` : ""}${t.winner ? ` · ganó ${t.winner}` : ""}${t.winnerPrice ? ` con ${usd(t.winnerPrice)}` : ""}${t.winnerPrice ? "" : " · falta registrar el precio de cierre"}`);
  }
  if (results.length) {
    const s = tenderStats(tenders);
    if (s.winRate !== null) lines.push(`Tasa de éxito acumulada: ${Math.round(s.winRate * 100)} % (${s.byStatus.won} de ${s.decided} resueltos)`);
  }

  const collected = records.filter((r) => r.direction === "income" && r.status === "paid" && inWeek(r.paidAt));
  if (collected.length) lines.push(`Cobrado: ${usd(collected.reduce((s, r) => s + net(r), 0))} en ${collected.length} cuenta(s)`);
  const paid = records.filter((r) => r.direction === "expense" && r.status === "paid" && inWeek(r.paidAt));
  if (paid.length) lines.push(`Pagado: ${usd(paid.reduce((s, r) => s + net(r), 0))} en ${paid.length} obligación(es)`);

  return { total: lines.length, lines };
}
