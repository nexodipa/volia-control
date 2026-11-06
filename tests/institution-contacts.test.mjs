import assert from "node:assert/strict";
import test from "node:test";
import { contactsFor, findResponsible, normalizeContact, responsibleSummary, sameInstitution } from "../lib/institution-contacts.ts";

const c = (o) => ({ id: "1", institution: "HOSPITAL GENERAL IBARRA", name: "Ana", role: "Administradora", phone: "", email: "", from: "", to: "", notes: "", ...o });

test("normaliza y descarta registros sin id o sin institución", () => {
  assert.equal(normalizeContact({ id: "x" }), null);
  assert.equal(normalizeContact(null), null);
  assert.deepEqual(normalizeContact({ id: " 1 ", institution: " H  Ibarra ", name: "A", from: "2026-13", to: "2026-01-02" }), { id: "1", institution: "H Ibarra", name: "A", role: "", phone: "", email: "", from: "", to: "2026-01-02", notes: "" });
});

test("misma institución sin importar mayúsculas, tildes o nombre abreviado", () => {
  assert.ok(sameInstitution("Hospital General Ibarra", "HOSPITAL GENERAL IBARRA"));
  assert.ok(sameInstitution("HOSPITAL GENERAL IBARRA", "Hospital General Ibarra – Imbabura"));
  assert.ok(!sameInstitution("Hospital General Ibarra", "Hospital General Riobamba"));
  assert.ok(!sameInstitution("", "Hospital"));
  assert.ok(!sameInstitution("IESS", "IESS Quito Sur"), "un nombre demasiado corto no basta para igualar");
});

test("el responsable depende de la fecha: gana el periodo que empezó más tarde y los vacíos son abiertos", () => {
  const list = [c({ id: "a", name: "Ana", to: "2026-06-30" }), c({ id: "b", name: "Beto", from: "2026-07-01" }), c({ id: "z", institution: "OTRO HOSPITAL", name: "Zoe" })];
  assert.equal(findResponsible(list, "Hospital General Ibarra", "2026-03-10").name, "Ana");
  assert.equal(findResponsible(list, "Hospital General Ibarra", "2026-07-01").name, "Beto");
  assert.equal(findResponsible(list, "Hospital General Ibarra", "").name, "Beto", "sin fecha se prefiere el más reciente");
  assert.equal(findResponsible(list, "Clínica X", "2026-03-10"), null);
  assert.equal(findResponsible(list, "", "2026-03-10"), null);
});

test("resumen para la ficha de cirugía y orden de contactos por institución", () => {
  assert.deepEqual(responsibleSummary(null, "H", ""), { name: "Pendiente", detail: "Ingresa la fecha de la cirugía", matched: false });
  assert.equal(responsibleSummary(null, "H", "2026-01-01").name, "Sin registrar");
  assert.deepEqual(responsibleSummary(c({ phone: "099", email: "a@h.ec" }), "H", "2026-01-01"), { name: "Ana", detail: "Administradora · 099 · a@h.ec", matched: true });
  const list = [c({ id: "old", to: "2026-01-31", name: "Viejo" }), c({ id: "now", from: "2026-02-01", name: "Actual" })];
  assert.deepEqual(contactsFor(list, "HOSPITAL GENERAL IBARRA", "2026-11-06").map((x) => x.name), ["Actual", "Viejo"]);
});
