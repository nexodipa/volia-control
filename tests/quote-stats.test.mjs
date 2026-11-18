import assert from "node:assert/strict";
import test from "node:test";
import { monthQuotes, quoteLines } from "../lib/quote-stats.ts";
import { buildMonthlyReport } from "../lib/monthly-report.ts";

const URL = "https://x.example";
const q = (o = {}) => ({ number: "VOL-1", customer: "Hospital X", total: 1000, status: "sent", sentAt: "2026-10-10", decidedAt: "", ...o });
const TODAY = "2026-11-02";

test("counts what was sent in the month and what is still open", () => {
  const m = monthQuotes([q(), q({ sentAt: "2026-10-20", total: 500 }), q({ sentAt: "2026-09-01" })], "2026-10", TODAY);
  assert.equal(m.sent.count, 2);
  assert.equal(m.sent.total, 1500);
  assert.equal(m.open.count, 3);
  assert.equal(m.open.total, 2500);
  assert.equal(m.open.stale, 1); // solo la del 1-sep pasa de 30 días al 2-nov; la del 10-oct lleva 23
});

test("won and lost count by the day of the decision, not the day of sending", () => {
  const m = monthQuotes([
    q({ status: "won", sentAt: "2026-08-01", decidedAt: "2026-10-05", total: 2000 }),
    q({ status: "lost", sentAt: "2026-10-01", decidedAt: "2026-10-09", total: 800 }),
    q({ status: "won", sentAt: "2026-09-01", decidedAt: "2026-09-30", total: 700 }),
    q({ status: "lost", decidedAt: "" }),
  ], "2026-10", TODAY);
  assert.deepEqual(m.won, { count: 1, total: 2000 });
  assert.deepEqual(m.lost, { count: 1, total: 800 });
  assert.equal(m.winRate, 0.5);
  assert.equal(m.open.count, 0);
});

test("no decisions gives no win rate and an empty log gives nothing", () => {
  assert.equal(monthQuotes([q()], "2026-10", TODAY).winRate, null);
  const none = monthQuotes([], "2026-10", TODAY);
  assert.equal(none.any, false);
  assert.deepEqual(quoteLines(none), []);
});

test("lines read well and carry the caveat", () => {
  const lines = quoteLines(monthQuotes([q({ status: "won", decidedAt: "2026-10-05", total: 2000 }), q({ sentAt: "2026-09-01", total: 300 })], "2026-10", TODAY));
  assert.equal(lines[0], "Enviadas en el mes: 1 por USD 2.000,00");
  assert.match(lines[1], /^Ganadas: 1 \(USD 2\.000,00\) · Perdidas: 0 · 100 % de lo decidido se ganó$/);
  assert.match(lines[2], /^Siguen sin respuesta: 1 por USD 300,00 \(1 con 30 días o más\)$/);
  assert.match(lines[3], /Solo cuenta lo marcado/);
});

test("the monthly report adds the quotes section only when there is something to say", () => {
  const records = [{ direction: "income", status: "paid", dueDate: "2026-10-20", date: "2026-10-05", counterparty: "H", document: "F1", subtotal: 1000, iva: 150, withholding: 0, paidAt: "2026-10-20" }];
  const withQ = buildMonthlyReport({ records, tenders: [], docs: [], quotes: [q({ status: "won", decidedAt: "2026-10-05" })] }, TODAY, URL);
  assert.ok(withQ);
  assert.match(withQ.text, /\nCotizaciones\n- Enviadas en el mes: 1/);
  assert.match(withQ.html, /<h3[^>]*>Cotizaciones<\/h3>/);
  const without = buildMonthlyReport({ records, tenders: [], docs: [] }, TODAY, URL);
  assert.doesNotMatch(without.text, /Cotizaciones/);
  assert.doesNotMatch(without.html, /Cotizaciones/);
});
