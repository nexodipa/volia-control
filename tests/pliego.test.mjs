import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { esNumber, parsePliego } from "../lib/pliego.ts";

const items = JSON.parse(readFileSync(new URL("./fixtures/pliego-dental.json", import.meta.url), "utf8"));

test("reads process data and the 2.2 budget table of a SERCOP pliego", () => {
  const p = parsePliego(items);
  assert.equal(p.code, "SIE-MDMQ-2026-2605");
  assert.equal(p.entity, "Unidad Metropolitana de Salud Sur");
  assert.match(p.object, /^ADQUISICION DE DISPOSITIVOS E INSUMOS/);
  assert.equal(p.budget, 34146.87);
  assert.equal(p.items.length, 47);
  const sum = p.items.reduce((s, i) => s + i.total, 0);
  assert.ok(Math.abs(sum - p.budget) < 0.01);
  assert.deepEqual(p.items[4], { item: 5, cpc: "481300911", description: "Aguja tipo carpule 30 G, de 8 mm hasta 12 mm de longitud", unit: "u", quantity: 555, unitPrice: 0.08, total: 44.4 });
  assert.ok(p.items.some((i) => i.cpc === "4813009120"), "CPC partido en dos líneas se une");
});

test("ecuadorian number format", () => {
  assert.equal(esNumber("1.476,38000"), 1476.38);
  assert.equal(esNumber("$34.146,87000"), 34146.87);
  assert.equal(esNumber("4875"), 4875);
  assert.ok(Number.isNaN(esNumber("")));
});
