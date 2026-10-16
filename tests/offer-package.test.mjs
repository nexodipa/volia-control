import assert from "node:assert/strict";
import test from "node:test";
import { buildLines, checklist, commitmentText, groupBySupplier, integrityText, longDate, missingFields, DEFAULT_COMPANY } from "../lib/offer-package.ts";

const records = [
  { id: "a", kind: "Registro sanitario", reference: "12578-DME-0122", subject: "Jeringas hipodérmicas Andino (Prodimeda)", items: "", expiresAt: "2028-01-04", note: "" },
  { id: "b", kind: "Registro sanitario", reference: "58-DMN-1117", subject: "Botas impermeables, cubre zapatos quirúrgicos y respirador KN95", items: "", expiresAt: "2026-10-30", note: "" },
  { id: "c", kind: "Registro sanitario", reference: "1-DME-0101", subject: "Guantes quirúrgicos sin polvo", items: "", expiresAt: null, note: "" },
];
const items = [
  { description: "Jeringas hipodérmicas 5 ml", quantity: 1000, brand: "Andino", unitPrice: 0.08 },
  { description: "Cubre zapatos quirúrgicos", quantity: 463, brand: "Dhisve" },
  { description: "Guantes quirúrgicos 7.5 sin polvo", quantity: 200, brand: "" },
  { description: "Tira reactiva hemoglobina", quantity: 50, brand: "" },
  { description: "  ", quantity: 3 },
];
const process = { code: "SIE-X-2026-1", entity: "Entidad", object: "Insumos", date: "2026-08-28", recipient: "", recipientRole: "", award: "", awardDate: "", deliveryDays: "", validityDays: "" };

test("lines number items, skip blanks and use supplier overrides", () => {
  const lines = buildLines(items, records, "2026-10-16", (_d, b) => b, { 3: "Prodimeda" });
  assert.equal(lines.length, 4);
  assert.equal(lines[2].supplier, "Prodimeda");
  assert.equal(lines[0].regulatory.record.reference, "12578-DME-0122");
  const groups = groupBySupplier(lines);
  assert.deepEqual(groups.map((g) => g.supplier), ["Andino", "Dhisve", "Prodimeda"]);
});

test("checklist flags expiring, undated and missing registrations", () => {
  const rows = checklist(buildLines(items, records, "2026-10-16"));
  assert.equal(rows[0].state, "vigente");
  assert.equal(rows[1].state, "por vencer");
  assert.equal(rows[2].state, "sin fecha");
  assert.equal(rows[3].state, "sin registro");
});

test("texts carry the process data and long dates", () => {
  assert.equal(longDate("2026-08-28"), "28 de agosto de 2026");
  assert.match(integrityText(process)[1], /SIE-X-2026-1/);
  assert.match(commitmentText(process, DEFAULT_COMPANY, "DISHVE").after[0], /a DISHVE/);
  const miss = missingFields(process, DEFAULT_COMPANY, buildLines(items, records, "2026-10-16"));
  assert.ok(miss.includes("representante legal"));
  assert.ok(miss.some((m) => m.startsWith("proveedor de 2")));
});
