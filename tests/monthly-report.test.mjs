import assert from "node:assert/strict";
import test from "node:test";
import { agingBuckets, buildMonthlyReport, inReportWindow, isFirstBusinessDay, monthBefore, monthFinance, topClients } from "../lib/monthly-report.ts";
import { sendMonthlyReport } from "../lib/monthly-sender.ts";

const APP = "https://volia-control.nexodipa.workers.dev";
const fin = (o) => ({ direction: "income", status: "pending", date: "2026-09-10", dueDate: "2026-10-01", counterparty: "Hospital A", document: "F-1", subtotal: 1000, iva: 150, withholding: 50, ...o });

test("primer día hábil del mes", () => {
  assert.equal(isFirstBusinessDay("2026-10-01"), true, "jueves 1");
  assert.equal(isFirstBusinessDay("2026-10-02"), false);
  assert.equal(isFirstBusinessDay("2026-11-01"), false, "domingo");
  assert.equal(isFirstBusinessDay("2026-11-02"), true, "lunes 2 tras domingo 1");
  assert.equal(isFirstBusinessDay("2026-11-03"), false);
  assert.equal(isFirstBusinessDay("2026-08-03"), true, "lunes 3 tras sábado y domingo");
  assert.equal(isFirstBusinessDay("2026-08-02"), false);
});

test("mes anterior con cambio de año y nombre en español", () => {
  assert.deepEqual(monthBefore("2027-01-04", 1), { key: "2026-12", label: "diciembre de 2026" });
  assert.deepEqual(monthBefore("2026-10-01", 2), { key: "2026-08", label: "agosto de 2026" });
});

test("totales del mes: facturado con IVA, cobrado y por cobrar netos de retención, resultado sin IVA", () => {
  const r = [fin({ status: "paid" }), fin({ subtotal: 2000, iva: 300, withholding: 0 }), fin({ date: "2026-08-01" }), fin({ direction: "expense", subtotal: 400, iva: 60, withholding: 0, status: "paid" })];
  const m = monthFinance(r, "2026-09");
  assert.equal(m.billed, 3450); assert.equal(m.collected, 1100); assert.equal(m.pending, 2300);
  assert.equal(m.expenses, 460); assert.equal(m.expensesPaid, 460); assert.equal(m.result, 2600); assert.equal(m.count, 3);
});

test("cartera vencida por antigüedad: solo cobros pendientes ya vencidos", () => {
  const today = "2026-11-02";
  const r = [fin({ dueDate: "2026-10-20" }), fin({ dueDate: "2026-09-20" }), fin({ dueDate: "2026-08-20" }), fin({ dueDate: "2026-05-01" }), fin({ dueDate: "2026-11-20" }), fin({ dueDate: "2026-10-01", status: "paid" }), fin({ dueDate: "2026-10-01", direction: "expense" })];
  const a = agingBuckets(r, today);
  assert.deepEqual(a.map((b) => b.count), [1, 1, 1, 1]);
  assert.equal(a[0].amount, 1100);
});

test("principales clientes del mes, ordenados y limitados", () => {
  const r = ["A", "B", "C", "D", "E", "F"].map((n, i) => fin({ counterparty: "Cliente " + n, subtotal: 100 * (i + 1), iva: 0 })).concat([fin({ counterparty: "Cliente A", subtotal: 900, iva: 0 })]);
  const t = topClients(r, "2026-09", 3);
  assert.deepEqual(t.map((c) => [c.name, c.amount]), [["Cliente A", 1000], ["Cliente F", 600], ["Cliente E", 500]]);
});

test("el informe resume el mes, compara y no se genera sin datos", () => {
  assert.equal(buildMonthlyReport({ records: [], tenders: [], docs: [] }, "2026-10-01", APP), null);
  const records = [fin({ status: "paid" }), fin({ date: "2026-08-15", subtotal: 500, iva: 0 })];
  const rep = buildMonthlyReport({ records, tenders: [], docs: [{ reference: "R", kind: "x", subject: "", expiresAt: "2026-10-20" }] }, "2026-10-01", APP);
  assert.equal(rep.monthKey, "2026-09");
  assert.match(rep.subject, /septiembre de 2026/); assert.match(rep.text, /Facturado: USD 1\.150,00 \(\+130 %/); assert.match(rep.text, /1 por vencer en 90 días/);
  assert.match(rep.html, /Cartera vencida/); assert.doesNotMatch(rep.html, /<script/i);
});

function fakeDb(finance, saved = new Map()) {
  return {
    saved,
    prepare(q) {
      const st = { args: [], bind(...a) { st.args = a; return st; }, async all() {
        if (q.includes("regulatory_documents")) return { results: [] };
        if (q.includes("'finance'")) return { results: finance.map((f) => ({ data: JSON.stringify(f) })) };
        if (q.includes("'tenders'")) return { results: [] };
        const k = st.args[1]; return { results: saved.has(k) ? [{ data: saved.get(k) }] : [] };
      } };
      return st;
    },
    async batch(sts) { for (const s of sts) saved.set(s.args[1], s.args[2]); },
  };
}
const cfg = { url: "https://script.google.com/macros/s/ABC123/exec", secret: "s" };

test("se envía el primer día hábil, una sola vez por mes, y la prueba siempre sale", async () => {
  const sent = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (_u, init) => { sent.push(JSON.parse(init.body)); return new Response(JSON.stringify({ ok: true }), { status: 200 }); };
  try {
    const db = fakeDb([fin({ status: "paid" })]);
    const day = new Date("2026-10-01T13:00:00Z");
    assert.equal((await sendMonthlyReport(db, cfg, { now: new Date("2026-10-13T13:00:00Z") })).sent, false, "fuera de la ventana");
    assert.equal(sent.length, 0);
    assert.equal((await sendMonthlyReport(db, cfg, { now: day })).sent, true);
    assert.equal(sent.length, 1); assert.match(sent[0].subject, /Informe de septiembre/);
    const again = await sendMonthlyReport(db, cfg, { now: day });
    assert.equal(again.sent, false); assert.match(again.message, /ya se envió/); assert.equal(sent.length, 1);
    const test = await sendMonthlyReport(db, cfg, { now: new Date("2026-10-13T13:00:00Z"), test: true });
    assert.equal(test.sent, true); assert.match(sent[1].subject, /^\[Prueba\]/);
  } finally { globalThis.fetch = real; }
});

test("si Gmail falla no se anota como enviado y se reintenta", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 500 });
  try {
    const db = fakeDb([fin()]);
    const r = await sendMonthlyReport(db, cfg, { now: new Date("2026-10-01T13:00:00Z") });
    assert.equal(r.ok, false); assert.equal(db.saved.size, 0);
  } finally { globalThis.fetch = real; }
});

test("ventana de envío: lunes a viernes hasta el día 7", () => {
  assert.equal(inReportWindow("2026-10-01"), true); assert.equal(inReportWindow("2026-10-07"), true);
  assert.equal(inReportWindow("2026-10-08"), false); assert.equal(inReportWindow("2026-10-03"), false, "sábado");
});

test("si falla el primer día, el siguiente día hábil lo reintenta y luego no repite", async () => {
  const real = globalThis.fetch;
  const db = fakeDb([fin()]);
  try {
    globalThis.fetch = async () => new Response("{}", { status: 500 });
    assert.equal((await sendMonthlyReport(db, cfg, { now: new Date("2026-10-01T13:00:00Z") })).ok, false);
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; return new Response(JSON.stringify({ ok: true }), { status: 200 }); };
    assert.equal((await sendMonthlyReport(db, cfg, { now: new Date("2026-10-02T13:00:00Z") })).sent, true);
    assert.equal((await sendMonthlyReport(db, cfg, { now: new Date("2026-10-05T13:00:00Z") })).sent, false);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = real; }
});
