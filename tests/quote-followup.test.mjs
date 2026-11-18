import assert from "node:assert/strict";
import test from "node:test";
import { followStage, quoteFollowUps, quoteDraft, followLine } from "../lib/quote-followup.ts";
import { buildDigest } from "../lib/alert-digest.ts";

const TODAY = "2026-11-23"; // lunes
const q = (o = {}) => ({ number: "VOL-20261110-001", date: "2026-11-10", customer: "Hospital A", total: 1150, status: "sent", sentAt: "2026-11-12", data: { meta: { validity: 15, contact: "Dra. Paz" } }, ...o });

test("stages by days since sending", () => {
  assert.equal(followStage(4), null);
  assert.equal(followStage(5), "consulta");
  assert.equal(followStage(9), "consulta");
  assert.equal(followStage(10), "insistencia");
  assert.equal(followStage(19), "insistencia");
  assert.equal(followStage(20), "decision");
  assert.equal(followStage(90), "decision");
  assert.equal(followStage(91), null);
});

test("only quotes marked as sent, with a send date, are followed", () => {
  const list = [q(), q({ number: "B", status: undefined, sentAt: undefined }), q({ number: "C", status: "won" }), q({ number: "D", status: "lost" }), q({ number: "E", sentAt: "" })];
  assert.deepEqual(quoteFollowUps(list, TODAY, true).map((f) => f.quote.number), ["VOL-20261110-001"]);
});

test("Monday lists every quote due; other weekdays only the marks", () => {
  const list = [q({ number: "A", sentAt: "2026-11-18" }), q({ number: "B", sentAt: "2026-11-13" }), q({ number: "C", sentAt: "2026-11-03" }), q({ number: "D", sentAt: "2026-11-21" })];
  assert.deepEqual(quoteFollowUps(list, TODAY, true).map((f) => [f.quote.number, f.days]), [["C", 20], ["B", 10], ["A", 5]]);
  assert.deepEqual(quoteFollowUps(list, TODAY, false).map((f) => f.quote.number), ["C", "B", "A"]);
  assert.deepEqual(quoteFollowUps([q({ sentAt: "2026-11-15" })], "2026-11-24", false), []);
  assert.equal(quoteFollowUps([q({ sentAt: "2026-11-15" })], "2026-11-24", true).length, 1);
});

test("the line names quote, customer, total, days and action", () => {
  const f = quoteFollowUps([q()], TODAY, true)[0];
  assert.equal(followLine(f), "VOL-20261110-001 · Hospital A · USD 1.150,00 · enviada hace 11 día(s) · insistir y ofrecer aclarar precio, entrega o forma de pago");
});

test("draft uses the registered contact, mentions validity, and never carries the patient", () => {
  const quote = q({ data: { meta: { validity: 15, contact: "Dra. Paz", patient: "JUAN PEREZ" } } });
  const d = quoteDraft(quote, TODAY, [{ id: "1", institution: "Hospital A", name: "Ing. Ana Mora", role: "", phone: "", email: "ana@a.ec", from: "", to: "", notes: "" }]);
  assert.equal(d.to, "ana@a.ec");
  assert.match(d.body, /^Estimado\(a\) Ing\. Ana Mora:/);
  assert.match(d.body, /oferta VOL-20261110-001 del 10 de noviembre del 2026 por USD 1\.150,00/);
  assert.match(d.body, /hasta el 25 de noviembre del 2026/);
  assert.match(d.subject, /Seguimiento de oferta VOL-20261110-001/);
  assert.doesNotMatch(d.body + d.subject, /JUAN|PEREZ/i);
});

test("draft falls back to the quote's contact name, then to the institution; expired validity is stated", () => {
  const a = quoteDraft(q({ date: "2026-10-01" }), TODAY);
  assert.match(a.body, /^Estimado\(a\) Dra\. Paz:/);
  assert.match(a.body, /ya pasó/);
  const b = quoteDraft(q({ data: {} }), TODAY);
  assert.match(b.body, /^Estimados señores de Hospital A:/);
  assert.equal(quoteDraft(q({ sentAt: "" }), TODAY), null);
});

test("a quote sent today has no draft yet; the decision stage asks for an answer date", () => {
  assert.equal(quoteDraft(q({ sentAt: TODAY }), TODAY), null);
  assert.match(quoteDraft(q({ sentAt: "2026-11-01" }), TODAY).body, /hasta el 28 de noviembre del 2026 si desea avanzar/);
});

test("digest includes the section and counts it; nothing due means no email", () => {
  const d = buildDigest([], [], TODAY, "https://x.example", [], [], undefined, [q()]);
  assert.ok(d);
  assert.equal(d.counts.cotizaciones, 1);
  assert.match(d.text, /Cotizaciones enviadas sin respuesta \(1\)/);
  assert.match(d.subject, /1 cotización\(es\) sin respuesta/);
  assert.equal(buildDigest([], [], TODAY, "https://x.example", [], [], undefined, [q({ sentAt: TODAY })]), null);
});
