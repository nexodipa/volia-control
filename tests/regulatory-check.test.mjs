import assert from "node:assert/strict";
import test from "node:test";
import { findRegulatoryDoc, needsAttention, stems } from "../lib/regulatory-check.ts";
import { REGULATORY_SEED } from "../lib/regulatory-data.ts";

const today = "2026-10-13";

test("stems drop accents, stopwords, numbers and plurals collapse", () => {
  assert.deepEqual([...stems("Jeringas hipodérmicas 3 ml para uso médico")], ["jerin", "hipod"]);
});

test("syringe lines map to the Andino registration expiring in 83 days", () => {
  const r = findRegulatoryDoc("Jeringa 3 ml, 21 G, 1\"", REGULATORY_SEED, today);
  assert.equal(r.record.reference, "12578-DME-0122");
  assert.equal(r.status, "proximo");
  assert.equal(r.days, 83);
  assert.equal(needsAttention(r), true);
});

test("gloves map to a valid registration; unrelated lines map to nothing", () => {
  const g = findRegulatoryDoc("Guantes quirúrgicos N° 7", REGULATORY_SEED, today);
  assert.equal(g.record.reference, "DM-0926-03-05");
  assert.equal(needsAttention(g), false);
  assert.equal(findRegulatoryDoc("Placa LCP anatómica", REGULATORY_SEED, today), null);
});

test("ISO and authorizations are never proposed as a product registration", () => {
  const r = findRegulatoryDoc("Tirillas de glucosa", REGULATORY_SEED, today);
  assert.ok(!r || (r.record.kind === "Registro sanitario" || r.record.kind === "Notificación sanitaria"));
});

test("items from the informe de necesidad: how many lines get a document", () => {
  const lines = ["Ácido Acético 5%", "Aguja hipodérmica 23 G", "Alcohol Etílico 96°", "Algodón hidrófilo, torundas", "Botas impermeables descartables", "Cinta química externa para esterilización", "Contenedor para objetos corto punzantes", "Cubre zapatos quirúrgicos", "Depresor para la lengua", "Electrodo adulto", "Equipo micro gotero", "Formaldehído 10 %", "Gel Alcohol 69°", "Guantes quirúrgicos N°6.5", "Hipoclorito de Sodio 5%", "Jeringa 10 ml", "Respirador mascarilla", "Set Papanicolaou", "Sulfato Férrico 20%", "Tira adhesiva alargada", "Venda de gasa 3"];
  const found = lines.map((l) => [l, findRegulatoryDoc(l, REGULATORY_SEED, today)?.record.reference ?? null]);
  const matched = found.filter(([, ref]) => ref).length;
  assert.ok(matched >= 14, `solo ${matched} de ${lines.length}: ${JSON.stringify(found)}`);
});
