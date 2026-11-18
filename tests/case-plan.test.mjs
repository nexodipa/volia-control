import assert from "node:assert/strict";
import test from "node:test";
import { nextStep, caseSteps, caseDraft } from "../lib/case-plan.ts";

const TODAY = "2026-11-23";
const all = { letter: true, invoice: true, surgery: true, implants: true, signatures: true };
const rec = (o = {}) => ({ id: "c1", hospital: "Hospital A", surgeryDate: "2026-11-01", contract: "SIE-1", invoice: "001-001-000123", amount: 1000, paidAmount: 0, submittedDate: "", dueDate: "", status: "documents", documents: { ...all, signatures: false }, ...o });

test("paid cases have no step", () => {
  assert.equal(nextStep(rec({ status: "paid" }), TODAY), null);
  assert.equal(nextStep(rec({ paidAmount: 1000, status: "approved" }), TODAY), null);
});

test("incomplete file is flagged after five days and names what is missing", () => {
  assert.equal(nextStep(rec({ surgeryDate: "2026-11-19" }), TODAY), null);
  const s = nextStep(rec({ surgeryDate: "2026-11-18" }), TODAY);
  assert.equal(s.kind, "documentos");
  assert.equal(s.days, 5);
  assert.match(s.action, /firmas y respaldos/);
  assert.equal(s.drafts, false);
});

test("a complete file is ready to bill after three days", () => {
  assert.equal(nextStep(rec({ status: "ready", documents: all, surgeryDate: "2026-11-21" }), TODAY), null);
  assert.equal(nextStep(rec({ status: "ready", documents: all, surgeryDate: "2026-11-20" }), TODAY).kind, "facturar");
});

test("after submitting: wait, ask at 15, insist at 30, ask in writing at 45", () => {
  const at = (d) => nextStep(rec({ status: "submitted", submittedDate: d }), TODAY)?.kind ?? null;
  assert.equal(at("2026-11-10"), null);
  assert.equal(at("2026-11-08"), "consulta");
  assert.equal(at("2026-10-24"), "insistencia");
  assert.equal(at("2026-10-09"), "escrito");
  assert.equal(nextStep(rec({ status: "review", submittedDate: "2026-11-01" }), TODAY).kind, "consulta");
});

test("a submitted case without a submission date has no follow-up", () => {
  assert.equal(nextStep(rec({ status: "submitted", submittedDate: "" }), TODAY), null);
});

test("observed beats everything, then an overdue payment", () => {
  assert.equal(nextStep(rec({ status: "observed", submittedDate: "2026-09-01" }), TODAY).kind, "observada");
  const v = nextStep(rec({ status: "approved", submittedDate: "2026-09-01", dueDate: "2026-11-20" }), TODAY);
  assert.equal(v.kind, "vencida");
  assert.equal(v.days, 3);
});

test("approved without a payment date asks for it; with one, waits", () => {
  assert.equal(nextStep(rec({ status: "approved", submittedDate: "2026-11-02" }), TODAY).kind, "fecha-pago");
  assert.equal(nextStep(rec({ status: "approved", submittedDate: "2026-11-02", dueDate: "2026-12-10" }), TODAY), null);
});

test("steps are ordered by urgency, then oldest first", () => {
  const steps = caseSteps([
    rec({ id: "a", surgeryDate: "2026-11-10" }),
    rec({ id: "b", status: "observed" }),
    rec({ id: "c", status: "submitted", submittedDate: "2026-11-01" }),
    rec({ id: "d", status: "submitted", submittedDate: "2026-10-20" }),
    rec({ id: "e", status: "paid" }),
  ], TODAY);
  assert.deepEqual(steps.map((s) => s.id), ["b", "d", "c", "a"]);
});

test("the draft never carries the patient name and identifies the case by invoice and contract", () => {
  const r = { ...rec({ status: "submitted", submittedDate: "2026-10-20" }), patient: "JUAN PEREZ" };
  const step = nextStep(r, TODAY);
  const d = caseDraft(r, step, TODAY, [{ id: "1", institution: "Hospital A", name: "Ing. Ana Mora", role: "", phone: "", email: "ana@hospital.ec", from: "", to: "", notes: "" }]);
  assert.equal(d.to, "ana@hospital.ec");
  assert.match(d.body, /^Estimado\(a\) Ing\. Ana Mora:/);
  assert.match(d.body, /factura 001-001-000123, contrato o proceso SIE-1/);
  assert.match(d.body, /USD 1\.000,00/);
  assert.match(d.body, /34 días sin respuesta/);
  assert.doesNotMatch(d.body + d.subject, /JUAN|PEREZ/i);
});

test("steps that are internal work have no draft; without a contact the greeting names the institution", () => {
  const r = rec({ surgeryDate: "2026-11-10" });
  assert.equal(caseDraft(r, nextStep(r, TODAY), TODAY), null);
  const o = rec({ status: "observed" });
  const d = caseDraft(o, nextStep(o, TODAY), TODAY);
  assert.match(d.body, /^Estimados señores de Hospital A:/);
  assert.equal(d.to, "");
});
