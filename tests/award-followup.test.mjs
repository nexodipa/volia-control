import assert from "node:assert/strict";
import test from "node:test";
import { awardStage, awardFollowUps, awardLine, invoicedSince, AWARD_ADVICE, AWARD_ACTION } from "../lib/award-followup.ts";
import { normalizeTender } from "../lib/tenders.ts";
import { buildDigest } from "../lib/alert-digest.ts";

const URL = "https://x.example";
const won = (o = {}) => normalizeTender({ id: "t1", ref: "SIE-HG-AM-2026-036-2764", title: "Guantes", buyer: "Hospital General Ibarra", status: "won", ourPrice: 12500, resultAt: "2026-10-20", createdAt: "2026-10-01T10:00:00Z", ...o });
const income = (o = {}) => ({ direction: "income", counterparty: "HOSPITAL GENERAL IBARRA", date: "2026-10-28", ...o });

test("stage by days since the award", () => {
  assert.equal(awardStage(2), null);
  assert.equal(awardStage(3), "contrato");
  assert.equal(awardStage(14), "contrato");
  assert.equal(awardStage(15), "entrega");
  assert.equal(awardStage(30), "factura");
  assert.equal(awardStage(120), "factura");
  assert.equal(awardStage(121), null);
});

test("only won tenders with a result date are followed", () => {
  const today = "2026-11-19"; // 30 días después del 20 de octubre
  assert.equal(awardFollowUps([won({ status: "lost" })], [], today, true).length, 0);
  assert.equal(awardFollowUps([won({ status: "offered" })], [], today, true).length, 0);
  assert.equal(awardFollowUps([won({ resultAt: "" })], [], today, true).length, 0);
  const r = awardFollowUps([won()], [], today, true);
  assert.equal(r.length, 1);
  assert.equal(r[0].days, 30);
  assert.equal(r[0].stage, "factura");
});

test("an income to the same buyer since the award counts as invoiced", () => {
  assert.equal(invoicedSince("Hospital General Ibarra", "2026-10-20", [income()]), true);
  assert.equal(invoicedSince("Hospital General Ibarra", "2026-10-20", [income({ date: "2026-09-01" })]), false);
  assert.equal(invoicedSince("Hospital General Ibarra", "2026-10-20", [income({ counterparty: "Hospital Carlos Andrade Marin" })]), false);
  assert.equal(invoicedSince("Hospital General Ibarra", "2026-10-20", [income({ direction: "expense" })]), false);
  assert.equal(invoicedSince("Hospital General Ibarra", "2026-10-20", [income({ date: undefined })]), true);
  assert.equal(invoicedSince("", "2026-10-20", [income()]), false);
  assert.equal(awardFollowUps([won()], [income()], "2026-11-19", true).length, 0);
});

test("Tuesday to Friday only on the marks; Monday lists all", () => {
  const t = [won()];
  assert.equal(awardFollowUps(t, [], "2026-10-23", false).length, 1); // 3 días
  assert.equal(awardFollowUps(t, [], "2026-10-24", false).length, 0); // 4 días
  assert.equal(awardFollowUps(t, [], "2026-11-04", false).length, 1); // 15 días
  assert.equal(awardFollowUps(t, [], "2026-10-24", true).length, 1);
  assert.equal(awardFollowUps(t, [], "2027-03-01", true).length, 0); // más de 120 días
});

test("oldest awards come first and the line carries the action", () => {
  const r = awardFollowUps([won({ id: "a", ref: "A", resultAt: "2026-11-10" }), won({ id: "b", ref: "B", resultAt: "2026-10-20" })], [], "2026-11-19", true);
  assert.deepEqual(r.map((x) => x.tender.ref), ["B", "A"]);
  const line = awardLine(r[0]);
  assert.match(line, /^B · Hospital General Ibarra · USD 12\.500,00 · adjudicado hace 30 día\(s\)/);
  assert.ok(line.includes(AWARD_ACTION.factura));
  assert.notEqual(AWARD_ADVICE.factura, AWARD_ACTION.factura);
});

test("digest includes the section, the count and the subject", () => {
  const d = buildDigest([], [], "2026-11-19", URL, [won()]);
  assert.ok(d);
  assert.equal(d.counts.adjudicados, 1);
  assert.match(d.text, /Adjudicados por gestionar \(1\)/);
  assert.match(d.subject, /1 adjudicado\(s\) por gestionar/);
});

test("a billed award produces no digest", () => {
  assert.equal(buildDigest([], [income()], "2026-11-19", URL, [won()]), null);
});
