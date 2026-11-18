import assert from "node:assert/strict";
import test from "node:test";
import { collectionDraft, collectionStage, collectionTotal } from "../lib/collection-plan.ts";
import { buildDigest } from "../lib/alert-digest.ts";

const rec = (o = {}) => ({ counterparty: "Hospital General Ibarra", document: "001-002-000004521", dueDate: "2026-11-10", subtotal: 1000, iva: 150, withholding: 17.5, ...o });
const contact = (o = {}) => ({ id: "c1", institution: "HOSPITAL GENERAL IBARRA", name: "Dra. Lucía Paz", role: "Tesorería", phone: "", email: "tesoreria@hgi.gob.ec", from: "", to: "", notes: "", ...o });

test("stage depends on days overdue, none before the due date", () => {
  assert.equal(collectionStage(0), null);
  assert.equal(collectionStage(-3), null);
  assert.equal(collectionStage(1), "amable");
  assert.equal(collectionStage(14), "amable");
  assert.equal(collectionStage(15), "seguimiento");
  assert.equal(collectionStage(29), "seguimiento");
  assert.equal(collectionStage(30), "insistencia");
  assert.equal(collectionStage(59), "insistencia");
  assert.equal(collectionStage(60), "formal");
  assert.equal(collectionStage(400), "formal");
});

test("total is subtotal plus IVA minus withholding, rounded to cents", () => {
  assert.equal(collectionTotal(rec()), 1132.5);
  assert.equal(collectionTotal({ subtotal: 0.1, iva: 0.2, withholding: 0 }), 0.3);
});

test("no draft for an account that is not overdue", () => {
  assert.equal(collectionDraft(rec({ dueDate: "2026-11-18" }), "2026-11-18"), null);
  assert.equal(collectionDraft(rec({ dueDate: "2026-12-01" }), "2026-11-18"), null);
});

test("friendly reminder goes to the current responsible of the institution", () => {
  const d = collectionDraft(rec(), "2026-11-18", [contact()]);
  assert.equal(d.stage, "amable"); // 8 días
  assert.equal(d.to, "tesoreria@hgi.gob.ec");
  assert.equal(d.subject, "Recordatorio de pago: factura 001-002-000004521");
  assert.match(d.body, /^Estimado\(a\) Dra\. Lucía Paz:/);
  assert.match(d.body, /USD 1\.132,50/);
  assert.match(d.body, /venció el 10 de noviembre del 2026/);
  assert.match(d.body, /Volia S\.A\.S\.$/);
  assert.doesNotMatch(d.body, /adjunt/i);
});

test("without a registered contact it addresses the institution and leaves the recipient empty", () => {
  const d = collectionDraft(rec(), "2026-11-18");
  assert.equal(d.to, "");
  assert.match(d.body, /^Estimados señores de Hospital General Ibarra:/);
});

test("a contact whose period ended is not used", () => {
  const d = collectionDraft(rec(), "2026-11-18", [contact({ to: "2026-06-30" })]);
  assert.equal(d.to, "");
});

test("tone escalates with days overdue and asks for a date", () => {
  const at = (dueDate) => collectionDraft(rec({ dueDate }), "2026-11-18", []);
  assert.match(at("2026-11-01").subject, /^Seguimiento de pago/); // 17 días
  assert.match(at("2026-11-01").body, /lleva 17 días pendiente/);
  assert.match(at("2026-10-15").subject, /^Segundo aviso de pago/); // 34
  assert.match(at("2026-10-15").body, /hasta el 23 de noviembre del 2026/);
  const formal = at("2026-08-01"); // 109
  assert.match(formal.subject, /^Requerimiento de pago/);
  assert.match(formal.body, /hace 109 días/);
  assert.match(formal.body, /evaluaremos los siguientes pasos de cobranza/);
});

test("document-less invoice still produces a readable draft", () => {
  const d = collectionDraft(rec({ document: "" }), "2026-11-18");
  assert.match(d.subject, /factura pendiente/);
});

test("digest tells what to do for each overdue account", () => {
  const f = (o) => ({ direction: "income", status: "pending", dueDate: "2026-11-10", counterparty: "Hospital", document: "FAC 1", subtotal: 100, iva: 15, withholding: 0, ...o });
  const mon = buildDigest([], [f({}), f({ document: "FAC 2", dueDate: "2026-09-01" })], "2026-11-23", "https://x.example");
  assert.match(mon.text, /FAC 1 .*13 día\(s\) de atraso · recordatorio por correo/);
  assert.match(mon.text, /FAC 2 .*83 día\(s\) de atraso · carta formal/);
});
