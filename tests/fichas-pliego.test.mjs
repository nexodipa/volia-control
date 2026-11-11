import assert from "node:assert/strict";
import test from "node:test";
import { draftFromLine, draftName, inferComposicion, nameCoverage, proposeFichas } from "../lib/fichas-pliego.ts";
import { FICHAS_BASE } from "../lib/fichas-data.ts";

const PLIEGO = [
  ["Cabeza bipolar de cromo cobalto, diámetro externo 38 ± 2 mm", "cabeza-bipolar"],
  ["Vástago largo cementado con collar, 10 ± 2 mm x 200 ± 10 mm, cromo cobalto", "vastago-largo-cementado"],
  ["Vástago no cementado de titanio con recubrimiento, cono 10/14, tallas 6 a 15", "vastago-no-cementado"],
  ["Acetábulo no cementado de titanio de tres orificios, diámetros 40 a 64 mm", "acetabulo-tres-orificios"],
  ["Tornillo de esponjosa de titanio 6.5 mm, longitud 15 a 70 mm", "tornillo-esponjosa"],
  ["Inserto de acetábulo de polietileno UHMWPE", "inserto-acetabulo"],
  ["Vástago autobloqueante cementado con soporte en calcar", "vastago-autobloqueante"],
  ["Cótilo de polietileno entrecruzado con ceja antiluxante", "cotilo-entrecruzado"],
];

test("cada línea del pliego de cadera propone primero su ficha", () => {
  const out = proposeFichas(PLIEGO.map(([text]) => ({ text, quantity: 2 })), FICHAS_BASE);
  out.forEach((p, i) => assert.equal(p.candidates[0]?.id, PLIEGO[i][1], PLIEGO[i][0]));
});

test("el inserto no se confunde con el acetábulo ni con el cótilo", () => {
  const [p] = proposeFichas([{ text: "Inserto de acetábulo de polietileno UHMWPE", quantity: 1 }], FICHAS_BASE);
  assert.equal(p.candidates[0].id, "inserto-acetabulo");
  assert.ok(!p.candidates.some((c) => c.id === "acetabulo-tres-orificios"));
});

test("si las medidas del nombre no coinciden, se descarta la sugerencia", () => {
  const tornillo = FICHAS_BASE.find((f) => f.id === "tornillo-esponjosa");
  assert.equal(nameCoverage("Tornillo de esponjosa 4.5 mm", tornillo), 0);
  assert.ok(nameCoverage("Tornillo de esponjosa 6.5 mm", tornillo) >= 0.99);
  assert.ok(nameCoverage("Tornillo de esponjosa", tornillo) >= 0.6); // sin medidas en el pliego: se propone, se revisa
});

test("avisa cuando el material del pliego difiere del de la ficha", () => {
  const [p] = proposeFichas([{ text: "Cabeza bipolar de acero inoxidable 316L", quantity: 1 }], FICHAS_BASE);
  assert.equal(p.candidates[0].id, "cabeza-bipolar");
  assert.ok(p.candidates[0].avisos.some((a) => /acero inoxidable/.test(a)));
});

test("un producto que no está en la biblioteca no propone fichas y deja un borrador", () => {
  const [p] = proposeFichas([{ text: "Placa LCP bloqueada para tibia distal, acero inoxidable, 8 orificios", quantity: 3 }], FICHAS_BASE);
  assert.deepEqual(p.candidates, []);
  assert.equal(p.draft.nombre, "PLACA LCP BLOQUEADA PARA TIBIA DISTAL");
  assert.equal(p.draft.composicion, "Acero inoxidable 316L");
  assert.equal(p.quantity, 3);
});

test("inferComposicion reconoce los materiales habituales y distingue entrecruzado de UHMWPE", () => {
  assert.equal(inferComposicion("polietileno entrecruzado (XLPE)"), "Polietileno entrecruzado");
  assert.equal(inferComposicion("polietileno de ultra alto peso molecular"), "Polietileno de ultra alto peso molecular (UHMWPE)");
  assert.equal(inferComposicion("Cr-Co"), "Cromo cobalto");
  assert.equal(inferComposicion("aleación Ti6Al4V"), "Aleación de titanio");
  assert.equal(inferComposicion("algo sin material"), "");
});

test("draftName corta en la primera coma o medida y limita el largo", () => {
  assert.equal(draftName("Clavo endomedular tibial, 9 x 330 mm"), "CLAVO ENDOMEDULAR TIBIAL");
  assert.equal(draftName("Tornillo cortical 3.5 mm"), "TORNILLO CORTICAL");
  assert.equal(draftName("x".repeat(200)).length, 90);
  assert.equal(draftFromLine("  Malla   de titanio ").descripcion, "Malla de titanio");
});
