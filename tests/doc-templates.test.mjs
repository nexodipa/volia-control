import assert from "node:assert/strict";
import test from "node:test";
import { addMonths, authorizationLetter, authorizationMissing, joinList, letterDate, parseBrandLines, prefillFromCase, suggestRegistrations } from "../lib/doc-templates.ts";

const input = (o = {}) => ({
  date: "2026-10-23", city: "Quito", institution: "HOSPITAL GENERAL IBARRA", distributor: "VOLIA S.A.S.", distributorRuc: "1793206800001",
  productLine: "implantes de Traumatología", brands: parseBrandLines("JUST MEDICAL | 18146-DME-0225\nPERMEDICA | 17405-DME-1024, 17391-DME-1024"),
  process: "SIE-HG-IB-2026-044", validUntil: "2026-12-23", signer: "Raúl A. Bolaños D.", signerRole: "REPRESENTANTE", ...o,
});

test("fechas de carta y suma de meses sin pasarse de fin de mes", () => {
  assert.equal(letterDate("2026-12-23"), "23 de diciembre del 2026");
  assert.equal(addMonths("2026-10-23", 2), "2026-12-23");
  assert.equal(addMonths("2026-12-31", 2), "2027-02-28");
  assert.equal(addMonths("2026-08-31", 2), "2026-10-31");
  assert.equal(addMonths("", 2), "");
});

test("marcas: una por línea, registros separados por coma o 'y'", () => {
  assert.deepEqual(parseBrandLines("A | 1, 2\n\nB | 3 y 4\nC"), [{ brand: "A", registrations: ["1", "2"] }, { brand: "B", registrations: ["3", "4"] }, { brand: "C", registrations: [] }]);
  assert.equal(joinList(["a", "b", "c"]), "a, b y c");
  assert.equal(joinList(["a"]), "a");
});

test("la carta reproduce la estructura del modelo: marcas en plural, registros en plural, proceso y vigencia", () => {
  const l = authorizationLetter(input());
  assert.equal(l.salutation[1], "HOSPITAL GENERAL IBARRA");
  assert.match(l.intro, /VOLIA S\.A\.S\. con RUC: 1793206800001, está autorizado a distribuir los implantes de Traumatología de las siguientes marcas:/);
  assert.deepEqual(l.bullets, ["JUST MEDICAL con Registro Sanitario 18146-DME-0225", "PERMEDICA con Registros Sanitarios 17405-DME-1024 y 17391-DME-1024"]);
  assert.match(l.closing[0], /únicamente para el Proceso de Contratación Pública SIE-HG-IB-2026-044\.$/);
  assert.match(l.closing[1], /hasta el 23 de diciembre del 2026\.$/);
  assert.deepEqual(l.signoff, ["Atentamente,", "Raúl A. Bolaños D.", "REPRESENTANTE"]);
});

test("una sola marca va en singular y lo que falta queda entre corchetes", () => {
  const l = authorizationLetter(input({ brands: parseBrandLines("SOLA"), institution: "", process: "" }));
  assert.match(l.intro, /de la siguiente marca:/);
  assert.equal(l.bullets[0], "SOLA con Registro Sanitario [por completar]");
  assert.equal(l.salutation[1], "[Institución contratante]");
  assert.match(l.closing[0], /\[código del proceso\]/);
});

test("faltantes: lista exactamente lo que impide mandar la carta a firmar", () => {
  assert.deepEqual(authorizationMissing(input()), []);
  assert.deepEqual(authorizationMissing(input({ institution: "", validUntil: "", brands: parseBrandLines("A\nB | 1") })), ["institución contratante", "registro sanitario de A", "fecha de vigencia"]);
});

test("registros sugeridos desde Vigencias por nombre de marca, sin tildes ni mayúsculas", () => {
  const recs = [
    { id: "1", kind: "Registro sanitario", reference: "12578-DME-0122", subject: "Jeringas hipodérmicas Andino (Prodimeda)", items: "", expiresAt: null, note: "" },
    { id: "2", kind: "ISO", reference: "ISO 9001", subject: "Prodimeda calidad", items: "", expiresAt: null, note: "" },
    { id: "3", kind: "Notificación sanitaria", reference: "NS-9", subject: "Antisépticos PRODIMEDA", items: "", expiresAt: null, note: "" },
  ];
  assert.deepEqual(suggestRegistrations("prodiméda", recs), ["12578-DME-0122", "NS-9"]);
  assert.deepEqual(suggestRegistrations("xy", recs), []);
});

test("autollenado desde una cirugía", () => {
  assert.deepEqual(prefillFromCase({ patient: "P", hospital: "H", surgeryDate: "2026-10-01", contract: "C-1", amount: 1500.5, invoice: "001-001-000123" }), { institution: "H", patient: "P", surgeryDate: "2026-10-01", contract: "C-1", amount: "1500.5", detail: "Factura: 001-001-000123" });
});
