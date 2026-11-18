import assert from "node:assert/strict";
import test from "node:test";
import { cashOutlook } from "../lib/cash-outlook.ts";
import { buildDigest } from "../lib/alert-digest.ts";

const URL = "https://x.example";
const MON = "2026-11-16"; // lunes
const rec = (o = {}) => ({ direction: "income", status: "pending", dueDate: "2026-11-18", counterparty: "Hospital X", document: "F-1", subtotal: 1000, iva: 150, withholding: 0, ...o });

test("groups pending records by week from today and nets income and expense", () => {
  const r = cashOutlook([
    rec({ dueDate: "2026-11-18" }), // semana 1, cobro 1150
    rec({ direction: "expense", dueDate: "2026-11-20", subtotal: 300, iva: 45 }), // semana 1, pago 345
    rec({ direction: "expense", dueDate: "2026-11-25", subtotal: 2000, iva: 300 }), // semana 2, pago 2300
  ], MON);
  assert.equal(r.total, 2);
  assert.equal(r.weeks[0].income, 1150);
  assert.equal(r.weeks[0].expense, 345);
  assert.equal(r.weeks[0].balance, 805);
  assert.equal(r.weeks[1].balance, -2300);
  assert.equal(r.tight, 1);
  assert.match(r.lines[0], /^Del 16\/11 al 22\/11: por cobrar USD 1\.150,00, por pagar USD 345,00, saldo \+USD 805,00$/);
  assert.match(r.lines[1], /saldo −USD 2\.300,00 · los pagos superan lo que se espera cobrar/);
});

test("withholding reduces what is collected; paid and far-off records are ignored", () => {
  const r = cashOutlook([rec({ withholding: 50 }), rec({ status: "paid" }), rec({ dueDate: "2027-02-01" })], MON);
  assert.equal(r.weeks[0].income, 1100);
  assert.equal(r.total, 1);
});

test("overdue income is named apart and not added to any week", () => {
  const r = cashOutlook([rec({ dueDate: "2026-11-01" }), rec({ dueDate: "2026-11-19" })], MON);
  assert.equal(r.overdueIncome, 1150);
  assert.equal(r.weeks[0].income, 1150);
  assert.ok(r.lines.some((l) => l.startsWith("Aparte: USD 1.150,00 en cobros ya vencidos")));
});

test("nothing pending in the window gives an empty outlook", () => {
  const r = cashOutlook([rec({ status: "paid" }), rec({ dueDate: "2027-03-01" })], MON);
  assert.equal(r.total, 0);
  assert.deepEqual(r.lines, []);
  assert.equal(cashOutlook([], MON).total, 0);
});

test("the monday digest adds the section only next to other content", () => {
  const withPay = [rec({ direction: "expense", dueDate: "2026-11-17" }), rec({ direction: "expense", dueDate: "2026-11-27", subtotal: 500, iva: 0 })];
  const d = buildDigest([], withPay, MON, URL);
  assert.ok(d);
  assert.equal(d.counts.caja, 2);
  assert.match(d.text, /Caja de las próximas 4 semanas \(2 con saldo negativo\)/);
  // solo semana 3 con movimiento: el lunes no se envía correo por la caja sola
  assert.equal(buildDigest([], [rec({ direction: "expense", dueDate: "2026-12-05" })], MON, URL), null);
});

test("tuesday to friday never carries the outlook", () => {
  const d = buildDigest([], [rec({ direction: "expense", dueDate: "2026-11-17" })], "2026-11-17", URL);
  assert.ok(d);
  assert.equal(d.counts.caja, 0);
  assert.doesNotMatch(d.text, /Caja de las próximas/);
});
