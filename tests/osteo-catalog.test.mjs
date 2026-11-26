import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  FAMILIES, FAMILY_BY_ID, MATERIALS, MATERIALS_GUIDE, REGIONS, bestPrice, buildCatalog, classify, familyCounts,
  filterRows, flagLowPrices, materialOf, regionOf,
} from "../lib/osteo-catalog.ts";
import { IMPLANTS } from "../lib/osteo-atlas.ts";

const items = JSON.parse(readFileSync(new URL("../public/data/hecam-2026.json", import.meta.url), "utf8")).items;
const catalog = buildCatalog(items);
const trauma = items.filter((i) => /^Traumatolog/i.test(i.e ?? ""));

test("cada familia tiene explicación completa y un identificador único", () => {
  const ids = FAMILIES.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const f of FAMILIES) {
    assert.equal(FAMILY_BY_ID[f.id], f);
    assert.ok(f.name && f.short && f.what && f.principle && f.where, f.id);
  }
  for (const f of FAMILIES.filter((x) => x.id !== "otros")) {
    assert.ok(f.watch.length > 0 && f.tender.length > 0, `${f.id} sin advertencias`);
  }
});

test("el catálogo clasifica los implantes de Traumatología y deja fuera los insumos", () => {
  assert.ok(catalog.length >= 150, `solo ${catalog.length} implantes`);
  assert.ok(catalog.length < trauma.length + 10);
  const codes = new Set(catalog.map((r) => r.code));
  assert.equal(codes.size, catalog.length, "códigos repetidos");
  for (const out of ["06-3099", "06-3123", "06-1766", "06-2145", "06-2011"]) assert.ok(!codes.has(out), `${out} es un insumo`);
  for (const inn of ["09-0844", "09-0621", "09-0842", "09-0211", "09-0594", "09-0469", "09-0412"]) assert.ok(codes.has(inn), `${inn} debería estar`);
  for (const r of catalog) assert.ok(FAMILY_BY_ID[r.family] && REGIONS.includes(r.region) && MATERIALS.includes(r.material));
});

test("ninguna familia con implantes de osteosíntesis queda vacía y los conteos suman el total", () => {
  const counts = familyCounts(catalog);
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), catalog.length);
  for (const id of ["placas-anatomicas", "placas-generales", "miniplacas", "clavos", "cefalomedulares", "tornillos", "fijadores", "agujas-cables"]) {
    assert.ok(counts[id] > 0, `${id} vacía`);
  }
  assert.ok(counts.otros <= 3, "demasiados ítems sin familia");
});

test("los ítems del atlas (placa, agujas, fijador) caen en la familia correspondiente", () => {
  const family = Object.fromEntries(catalog.map((r) => [r.code, r.family]));
  assert.equal(family["09-0844"], "placas-generales");
  assert.equal(family["09-0621"], "fijadores");
  assert.equal(family["09-0211"], "agujas-cables");
  assert.equal(family["06-0155"], "agujas-cables");
  for (const imp of Object.values(IMPLANTS)) for (const h of imp.hecam) assert.ok(family[h.code], `${h.code} no está en el catálogo`);
});

test("clasificación por nombre: casos puntuales", () => {
  assert.equal(classify({ c: "x", n: "Sistema de placas anatómicas bloqueadas para húmero proximal", e: "Traumatología" }), "placas-anatomicas");
  assert.equal(classify({ c: "x", n: "Sistema de clavo cefalomedular antirotacional", e: "Traumatología" }), "cefalomedulares");
  assert.equal(classify({ c: "x", n: "Venda de yeso, 4\"", e: "Traumatología" }), null);
  assert.equal(classify({ c: "x", n: "Sistema de protésis total de rodilla cementada", e: "Traumatología" }), "protesis");
  assert.equal(classify({ c: "x", n: "Gasa", e: "Cirugía general" }), null);
});

test("región y material por nombre", () => {
  assert.equal(regionOf("Sistema de clavos telescopados (tipo Fassier Duval)"), "General");
  assert.equal(regionOf("Kit de reparación del ligamento patelofemoral"), "Rodilla");
  assert.equal(regionOf("Sistema placa gancho 3.5 mm para olécranon"), "Codo");
  assert.equal(regionOf("Clavo endomedular de húmero"), "Hombro y clavícula");
  assert.equal(materialOf("Sistema de placa LCP 3.5 mm de acero quirúrgico"), "Acero");
  assert.equal(materialOf("Tornillo de interferencia de titanio"), "Titanio");
  assert.equal(materialOf("Anclas biodegradables para manguito"), "Reabsorbible");
  assert.equal(materialOf("Sistema de prótesis cerámica/cerámica"), "Cerámica o circonio");
  assert.equal(materialOf("Placa"), "No indicado");
});

test("filtros del catálogo combinan familia, texto, región, material y precio", () => {
  const plates = filterRows(catalog, { family: "placas-anatomicas" });
  assert.ok(plates.length > 0 && plates.every((r) => r.family === "placas-anatomicas"));
  const byText = filterRows(catalog, { query: "OLÉCRANON" });
  assert.ok(byText.length > 0 && byText.every((r) => /ol[eé]cranon/i.test(r.name)));
  const ti = filterRows(catalog, { material: "Titanio" });
  assert.ok(ti.length > 0 && ti.every((r) => r.material === "Titanio"));
  const priced = filterRows(catalog, { onlyPriced: true });
  assert.ok(priced.every((r) => bestPrice(r) !== undefined));
  assert.equal(filterRows(catalog, { query: "zzzz-no-existe" }).length, 0);
  assert.equal(filterRows(catalog, {}).length, catalog.length);
});

test("alerta de precio bajo solo en familias comparables y con suficientes precios", () => {
  const mk = (code, family, pur) => ({ code, name: code, unit: "", family, region: "General", material: "No indicado", pur });
  const rows = flagLowPrices([mk("a", "placas-generales", 500), mk("b", "placas-generales", 520), mk("c", "placas-generales", 480), mk("d", "placas-generales", 510), mk("e", "placas-generales", 20)]);
  assert.deepEqual(rows.filter((r) => r.low).map((r) => r.code), ["e"]);
  const few = flagLowPrices([mk("a", "clavos", 500), mk("e", "clavos", 20)]);
  assert.ok(few.every((r) => !r.low), "con menos de 4 precios no se marca");
  const other = flagLowPrices([mk("a", "protesis", 500), mk("b", "protesis", 520), mk("c", "protesis", 480), mk("d", "protesis", 510), mk("e", "protesis", 20)]);
  assert.ok(other.every((r) => !r.low), "las familias heterogéneas no se marcan");
});

test("la guía de materiales está completa", () => {
  assert.ok(MATERIALS_GUIDE.length >= 5);
  for (const m of MATERIALS_GUIDE) assert.ok(m.name && m.properties.length > 0 && m.typicalUse && m.note);
});
