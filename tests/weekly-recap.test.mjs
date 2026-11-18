import assert from "node:assert/strict";
import test from "node:test";
import { weeklyRecap } from "../lib/weekly-recap.ts";
import { buildDigest } from "../lib/alert-digest.ts";
import { normalizeTender } from "../lib/tenders.ts";

const URL = "https://x.example";
const MON = "2026-11-23"; // lunes: la ventana es del 16 al 22
const tender = (o = {}) => normalizeTender({ id: "t1", ref: "SIE-1", title: "x", buyer: "Hospital A", status: "interested", createdAt: "2026-09-01T10:00:00Z", ...o });
const fin = (o = {}) => ({ direction: "income", status: "paid", dueDate: "2026-11-10", counterparty: "Hospital A", document: "F1", subtotal: 100, iva: 15, withholding: 2.5, paidAt: "2026-11-20", ...o });

test("resultAt is normalised", () => {
  assert.equal(tender({ resultAt: "2026-11-20" }).resultAt, "2026-11-20");
  assert.equal(tender({ resultAt: "x" }).resultAt, "");
});

test("window is the seven days before today, both ends included, today excluded", () => {
  const at = (d) => weeklyRecap([], [fin({ paidAt: d })], MON).total;
  assert.equal(at("2026-11-15"), 0);
  assert.equal(at("2026-11-16"), 1);
  assert.equal(at("2026-11-22"), 1);
  assert.equal(at("2026-11-23"), 0);
  assert.equal(at(""), 0);
  assert.equal(at(undefined), 0);
});

test("collected and paid are summed net of withholding", () => {
  const r = weeklyRecap([], [fin(), fin({ document: "F2", subtotal: 200, iva: 30, withholding: 0 }), fin({ direction: "expense", subtotal: 50, iva: 0, withholding: 0 }), fin({ status: "pending" })], MON);
  assert.deepEqual(r.lines, ["Cobrado: USD 342,50 en 2 cuenta(s)", "Pagado: USD 50,00 en 1 obligación(es)"]);
});

test("offers, results and success rate", () => {
  const ts = [
    tender({ id: "a", ref: "A", status: "offered", offeredAt: "2026-11-18" }),
    tender({ id: "b", ref: "B", status: "won", resultAt: "2026-11-19", ourPrice: 4500 }),
    tender({ id: "c", ref: "C", status: "lost", resultAt: "2026-11-20", winner: "Dimedic", winnerPrice: 4100 }),
    tender({ id: "d", ref: "D", status: "lost", resultAt: "2026-11-21" }),
    tender({ id: "e", ref: "E", status: "won", resultAt: "2026-10-01" }),
  ];
  const r = weeklyRecap(ts, [], MON);
  assert.match(r.lines.join("\n"), /Ofertas presentadas \(1\): A \(Hospital A\)/);
  assert.match(r.lines.join("\n"), /Adjudicado a Volia: B \(Hospital A\) · USD 4\.500,00/);
  assert.match(r.lines.join("\n"), /Perdido: C \(Hospital A\) · ganó Dimedic con USD 4\.100,00/);
  assert.match(r.lines.join("\n"), /Perdido: D .* falta registrar el precio de cierre/);
  assert.match(r.lines.join("\n"), /Tasa de éxito acumulada: 50 % \(2 de 4 resueltos\)/);
  assert.doesNotMatch(r.lines.join("\n"), /E \(Hospital A\)/);
});

test("new tenders created in the window are counted", () => {
  assert.deepEqual(weeklyRecap([tender({ createdAt: "2026-11-17T09:00:00Z" })], [], MON).lines, ["1 proceso(s) nuevos en seguimiento"]);
});

test("digest: recap shows on Monday, can be the only reason to send, and is absent on weekdays", () => {
  const d = buildDigest([], [fin()], MON, URL);
  assert.ok(d);
  assert.equal(d.counts.semana, 1);
  assert.match(d.text, /La semana pasada/);
  assert.match(d.text, /Cobrado: USD 112,50/);
  assert.equal(buildDigest([], [fin({ paidAt: "2026-11-23" })], "2026-11-24", URL), null);
  assert.equal(buildDigest([], [fin({ paidAt: "2026-11-23" })], "2026-11-24", URL)?.counts?.semana ?? 0, 0);
  assert.equal(buildDigest([], [], MON, URL), null);
});

test("recap goes after the urgent sections", () => {
  const d = buildDigest([], [fin(), fin({ status: "pending", paidAt: "", document: "F9", dueDate: "2026-11-01" })], MON, URL);
  assert.ok(d.text.indexOf("Cobros vencidos") < d.text.indexOf("La semana pasada"));
});
