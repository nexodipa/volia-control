import assert from "node:assert/strict";
import test from "node:test";
import { computeLanded, importVerdict, sameProduct, DEFAULT_IMPORT_SETTINGS } from "../lib/landed-cost.ts";

const L = (o) => ({ id: "a", product: "Hoja de sierra", qty: 100, fobUnit: 5, weightKg: 0, adValoremPct: 10, localUnitCost: 0, salePrice: 0, ...o });

test("one line: CIF, ad valorem, FODINFA and ISD follow the customs formula", () => {
  // FOB 500 + flete 50 + seguro 5 = CIF 555. Ad valorem 10 % = 55,5; FODINFA 0,5 % = 2,775; ISD 5 % de CIF = 27,75
  const r = computeLanded([L()], { freight: 50, insurance: 5 }, { ...DEFAULT_IMPORT_SETTINGS });
  const l = r.lines[0];
  assert.equal(l.cif, 555);
  assert.equal(l.adValorem, 55.5);
  assert.equal(l.fodinfa, 2.78);
  assert.equal(l.isd, 27.75);
  assert.equal(l.iva, 91.99); // 15 % de (555 + 55,5 + 2,775) = 15 % de 613,275
  assert.equal(l.landedTotal, 641.03); // 555 + 55,5 + 2,775 + 27,75; el IVA es crédito
  assert.ok(Math.abs(l.landedUnit - 6.41025) < 0.0001); // 641,025 / 100
});

test("IVA becomes cost when it is not recoverable", () => {
  const r = computeLanded([L()], { freight: 50, insurance: 5 }, { ivaRecoverable: false });
  assert.equal(r.lines[0].landedTotal, 733.02); // 641,025 + 91,99
  assert.equal(r.totals.ivaCredit, 0);
});

test("freight can be left out of the customs base, which lowers duties", () => {
  const withFreight = computeLanded([L()], { freight: 50 }, {}).lines[0];
  const without = computeLanded([L()], { freight: 50 }, { freightInBase: false }).lines[0];
  assert.equal(without.customsBase, 500);
  assert.ok(without.adValorem < withFreight.adValorem);
});

test("shared costs split by value, and by weight only when every line has weight", () => {
  const lines = [L({ id: "a", qty: 100, fobUnit: 9, weightKg: 1 }), L({ id: "b", qty: 100, fobUnit: 1, weightKg: 9 })];
  const byValue = computeLanded(lines, { freight: 100 }, {});
  assert.deepEqual(byValue.lines.map((l) => l.freight), [90, 10]);
  const byWeight = computeLanded(lines, { freight: 100 }, { allocateBy: "weight" });
  assert.deepEqual(byWeight.lines.map((l) => l.freight), [10, 90]);
  const missing = computeLanded([L({ weightKg: 0 }), L({ id: "b", weightKg: 5 })], { freight: 100 }, { allocateBy: "weight" });
  assert.equal(missing.warnings.length > 0, true);
});

test("local extras (broker, storage, transport, other) are added to the landed cost", () => {
  const r = computeLanded([L({ adValoremPct: 0 })], { broker: 40, storage: 20, localTransport: 25, other: 15 }, { isdPct: 0, fodinfaPct: 0 });
  assert.equal(r.lines[0].landedTotal, 600); // 500 + 100
});

test("savings and margin are measured per unit against local cost and sale price", () => {
  const r = computeLanded([L({ adValoremPct: 0, localUnitCost: 8, salePrice: 10 })], {}, { isdPct: 0, fodinfaPct: 0 });
  const l = r.lines[0]; // costo 5 por unidad
  assert.equal(l.savingsPct, 37.5);
  assert.equal(l.marginPct, 50);
  assert.equal(importVerdict(l), "Importar ahorra 37.5 %");
});

test("verdict warns when importing is not worth it", () => {
  assert.match(importVerdict({ savingsPct: 4, marginPct: null }), /no compensa/);
  assert.match(importVerdict({ savingsPct: -12, marginPct: null }), /más caro/);
  assert.equal(importVerdict({ savingsPct: null, marginPct: null }), "Sin costo local para comparar");
});

test("empty or invalid lines produce an empty result instead of NaN", () => {
  const r = computeLanded([L({ qty: 0 }), L({ fobUnit: -3 })], { freight: 50 });
  assert.deepEqual(r.lines, []);
  assert.equal(r.totals.landed, 0);
});

test("sameProduct rejects partial matches that only share generic words", () => {
  assert.equal(sameProduct("Hoja de sierra oscilante descartable", "Hoja descartable N° 3 para video laringoscopio"), false);
  assert.equal(sameProduct("Hoja de sierra oscilante descartable", "Hoja de sierra oscilante descartable 90 x 25 mm"), true);
  assert.equal(sameProduct("Jeringa 10 ml", "Jeringas descartables de 10 ml con aguja"), true);
  assert.equal(sameProduct("", "Algo"), false);
  assert.equal(sameProduct("Algo", undefined), false);
});
