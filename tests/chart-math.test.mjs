import assert from "node:assert/strict";
import test from "node:test";
import { axisTicks, barPercent, compact, donutArcs, niceMax } from "../lib/chart-math.ts";

test("niceMax redondea hacia arriba a 1, 2, 2.5, 5 o 10", () => {
  assert.equal(niceMax(0), 1); assert.equal(niceMax(-4), 1); assert.equal(niceMax(NaN), 1);
  assert.equal(niceMax(0.7), 1); assert.equal(niceMax(1.4), 2); assert.equal(niceMax(2.3), 2.5);
  assert.equal(niceMax(3.9), 5); assert.equal(niceMax(7), 10); assert.equal(niceMax(1234), 2000); assert.equal(niceMax(2400), 2500); assert.equal(niceMax(100), 100);
});
test("el eje parte de cero y llega al máximo redondo", () => {
  assert.deepEqual(axisTicks(1234, 4), [0, 500, 1000, 1500, 2000]);
  assert.equal(axisTicks(0).at(-1), 1);
});
test("barras: proporcional, con mínimo visible y sin pasarse de 100", () => {
  assert.equal(barPercent(50, 100), 50); assert.equal(barPercent(0.1, 100), 2); assert.equal(barPercent(0, 100), 0);
  assert.equal(barPercent(500, 100), 100); assert.equal(barPercent(5, 0), 0);
});
test("compact abrevia miles y millones", () => {
  assert.match(compact(950), /950/); assert.match(compact(12_500), /12[,.]5 mil|13 mil/); assert.match(compact(3_400_000), /3[,.]4 M/);
});
test("el anillo reparte 360 grados y descarta ceros y negativos", () => {
  const arcs = donutArcs([1, 1, 2, 0, -3]);
  assert.equal(arcs[2].end, 360); assert.equal(arcs[0].fraction, 0.25); assert.equal(arcs[3].fraction, 0); assert.equal(arcs[4].fraction, 0);
  assert.deepEqual(donutArcs([0, 0]).map((a) => a.fraction), [0, 0]);
});
