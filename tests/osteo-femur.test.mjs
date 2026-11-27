import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ATLAS_REGIONS, atlasRegion } from "../lib/osteo-regions.ts";
import { FEMUR_REGION } from "../lib/osteo-femur.ts";
import { gradeRegionQuiz, regionHecamCodes, validateRegion } from "../lib/osteo-region.ts";
import { interpolateSection } from "../lib/osteo-geometry.ts";
import {
  FEMUR_BOTTOM, FEMUR_SECTIONS, FEMUR_TOP, NAIL, NECK, PLATE,
  buildFemurFracture, femoralHead, femoralNeck, femurWhole, femurZoneAt, headScrewEnds, lateralCortexX, lesserTrochanter,
  medialCortexX, neckPoint, plateMesh, plateOuterX,
} from "../lib/osteo-femur-geometry.ts";

const UNIT = 2;
const items = JSON.parse(readFileSync(new URL("../public/data/hecam-2026.json", import.meta.url), "utf8")).items;
const byCode = new Map(items.map((i) => [i.c, i]));

function validMesh(m, label) {
  assert.ok(m.positions.length > 0 && m.positions.length % 3 === 0, label);
  assert.ok(m.indices.length > 0 && m.indices.length % 3 === 0, label);
  assert.ok(m.positions.every(Number.isFinite), `${label}: vértices finitos`);
  const n = m.positions.length / 3;
  assert.ok(m.indices.every((i) => Number.isInteger(i) && i >= 0 && i < n), `${label}: índices dentro de rango`);
}
const yRange = (m) => {
  let lo = Infinity, hi = -Infinity;
  for (let i = 1; i < m.positions.length; i += 3) { lo = Math.min(lo, m.positions[i]); hi = Math.max(hi, m.positions[i]); }
  return [lo, hi];
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test("el fémur está registrado y su contenido es coherente", () => {
  assert.ok(ATLAS_REGIONS.includes(FEMUR_REGION));
  assert.equal(atlasRegion("femur"), FEMUR_REGION);
  assert.deepEqual(validateRegion(FEMUR_REGION), []);
  assert.equal(FEMUR_REGION.sceneId, "femur");
});

test("los códigos HECAM del fémur existen y son del tipo de producto que dice el atlas", () => {
  for (const code of regionHecamCodes(FEMUR_REGION)) assert.ok(byCode.has(code), `falta ${code}`);
  assert.match(byCode.get("09-0842").n, /clavo cefalomedular antirotacional/i);
  assert.match(byCode.get("09-0843").n, /clavo cefalomedular de compresi/i);
  assert.match(byCode.get("09-0214").n, /clavos cefalomedulares de titanio/i);
  assert.match(byCode.get("09-0749").n, /LCP anat.mica para f.mur proximal/i);
  assert.match(byCode.get("09-0750").n, /f.mur proximal trocanterica/i);
});

test("el atlas dice la verdad: en el HECAM 2026 no hay sistema de tornillo-placa deslizante", () => {
  const sliding = items.filter((i) => /deslizante|dynamic hip|DHS/i.test(i.n));
  assert.deepEqual(sliding, []);
  assert.match(FEMUR_REGION.lessons.find((l) => l.id === "clavo-o-tornillo").body.join(" "), /no aparece un sistema de tornillo deslizante/);
});

test("el quiz del fémur se califica y tiene una sola respuesta correcta por pregunta", () => {
  assert.ok(FEMUR_REGION.quiz.length >= 10);
  const perfect = FEMUR_REGION.quiz.map((q) => q.answer);
  assert.deepEqual(gradeRegionQuiz(FEMUR_REGION, perfect), { correct: FEMUR_REGION.quiz.length, total: FEMUR_REGION.quiz.length, pct: 100 });
  assert.equal(gradeRegionQuiz(FEMUR_REGION, []).correct, 0);
  assert.ok(new Set(FEMUR_REGION.quiz.map((q) => q.answer)).size >= 3);
});

test("el fémur, la cabeza, el cuello y las fracturas generan mallas válidas", () => {
  validMesh(femurWhole(), "fémur");
  validMesh(femoralHead(), "cabeza");
  validMesh(femoralNeck(), "cuello");
  validMesh(lesserTrochanter(), "trocánter menor");
  validMesh(plateMesh(), "placa");
  for (const id of ["none", "a1", "a2", "a3"]) {
    const model = buildFemurFracture(id);
    assert.equal(model.id, id);
    for (const p of model.pieces) validMesh(p.mesh, `${id}/${p.id}`);
  }
  assert.equal(buildFemurFracture("none").pieces.length, 1);
  assert.equal(buildFemurFracture("a1").pieces.length, 2);
  assert.equal(buildFemurFracture("a2").pieces.length, 3);
  assert.equal(buildFemurFracture("a3").pieces.length, 2);
});

test("cada fractura desplaza al menos un fragmento y las piezas llenan los mismos límites verticales que el hueso", () => {
  const [wholeLo, wholeHi] = yRange(femurWhole());
  assert.ok(Math.abs(wholeLo - FEMUR_BOTTOM) < 1e-6);
  for (const id of ["a1", "a2", "a3"]) {
    const pieces = buildFemurFracture(id).pieces;
    const lo = Math.min(...pieces.map((p) => yRange(p.mesh)[0]));
    const hi = Math.max(...pieces.map((p) => yRange(p.mesh)[1]));
    assert.ok(Math.abs(lo - wholeLo) < 1e-6, `${id}: límite inferior`);
    assert.ok(Math.abs(hi - wholeHi) < 1e-6, `${id}: límite superior`);
    const moved = pieces.filter((p) => p.displaced.dx || p.displaced.dy || p.displaced.dz || p.displaced.rx || p.displaced.ry || p.displaced.rz);
    assert.ok(moved.length >= 1, id);
  }
});

test("las zonas del hueso son las que el atlas describe", () => {
  const ids = new Set(Object.keys(FEMUR_REGION.zones));
  const hc = NECK.headCenter;
  const probes = [
    [hc[0], hc[1], hc[2]],
    [0, 0, 0],
    [-0.55, 9.0, 0],
    [0.9, 5.6, -0.8],
  ];
  const got = probes.map(([x, y, z]) => femurZoneAt(x, y, z));
  assert.equal(got[0], "femur-head");
  assert.equal(got[1], "femur-shaft");
  assert.equal(got[2], "femur-trochanter-greater");
  assert.equal(got[3], "femur-trochanter-lesser");
  for (let y = FEMUR_BOTTOM; y <= FEMUR_TOP; y += 0.5) {
    const s = interpolateSection(FEMUR_SECTIONS, y);
    assert.ok(ids.has(femurZoneAt(s.cx ?? 0, y, 0)), `zona sin contenido a y=${y}`);
  }
});

test("el clavo cabe en el canal, el tornillo cefálico cruza el clavo y llega al hueso subcondral", () => {
  assert.ok(NAIL.radius * 2 * UNIT * 10 >= 9 && NAIL.radius * 2 * UNIT * 10 <= 11, "unos 10 mm");
  for (let y = NAIL.path[2][1]; y <= NAIL.path[1][1]; y += 0.25) {
    const sec = interpolateSection(FEMUR_SECTIONS, y);
    assert.ok(Math.abs(0 - (sec.cx ?? 0)) + NAIL.radius < sec.rx, `en y=${y} el clavo sale por un lado`);
    assert.ok(NAIL.radius < sec.rz, `en y=${y} el clavo sale por delante o detrás`);
  }
  // El tornillo cefálico pasa por el eje del clavo (x≈0) y termina cerca de la superficie de la cabeza.
  const ls = NAIL.lagScrew;
  let crossesNail = false;
  for (let t = ls.tStart; t <= ls.tEnd; t += 0.05) {
    if (Math.abs(neckPoint(t)[0]) < NAIL.radius) crossesNail = true;
  }
  assert.ok(crossesNail, "el tornillo cefálico atraviesa el clavo");
  const tip = neckPoint(ls.tEnd);
  const gap = NECK.headRadius - dist(tip, NECK.headCenter);
  assert.ok(gap > 0.05 && gap < 0.6, `la punta queda dentro de la cabeza a ${gap} unidades de la superficie`);
  // La entrada del clavo es la punta del trocánter mayor, no la cabeza.
  assert.ok(NAIL.path[0][1] <= FEMUR_TOP + 0.2);
  assert.ok(NAIL.distalLock.y > NAIL.path[2][1] && NAIL.distalLock.y < 0);
});

test("la placa va sobre la cortical lateral, cubre la cabeza y la diáfisis y sus tornillos caben en el hueso", () => {
  const m = plateMesh();
  for (let i = 0; i < m.positions.length; i += 3) {
    const x = m.positions[i], y = m.positions[i + 1];
    assert.ok(x <= lateralCortexX(y) + 1e-9 && x >= lateralCortexX(y) - PLATE.thickness - 0.05, `placa a x=${x} en y=${y}`);
  }
  assert.equal(PLATE.headScrews.length, 3);
  assert.equal(PLATE.shaftScrews.length, 4);
  for (const y of [...PLATE.headScrews, ...PLATE.shaftScrews]) assert.ok(y > PLATE.y[0] && y < PLATE.y[1], `tornillo y=${y} dentro de la placa`);
  assert.ok(Math.min(...PLATE.headScrews) > Math.max(...PLATE.shaftScrews), "los de la cabeza van por encima de los de la diáfisis");
  for (const y of PLATE.headScrews) {
    const e = headScrewEnds(y);
    assert.ok(dist(e.to, NECK.headCenter) < NECK.headRadius, `tornillo de y=${y} termina dentro de la cabeza`);
  }
  for (const y of PLATE.shaftScrews) {
    assert.ok(plateOuterX(y) < lateralCortexX(y) && medialCortexX(y) > lateralCortexX(y));
  }
});

test("las referencias de corteza son coherentes", () => {
  for (let y = FEMUR_BOTTOM; y <= FEMUR_TOP; y += 0.5) assert.ok(medialCortexX(y) > lateralCortexX(y), `y=${y}`);
});

test("los patrones del fémur describen los códigos AO/OTA 31A que dibuja el modelo", () => {
  const p = FEMUR_REGION.patterns;
  assert.equal(p.a1.ao, "31A1");
  assert.equal(p.a2.ao, "31A2");
  assert.equal(p.a3.ao, "31A3");
  for (const id of ["a1", "a2", "a3"]) assert.ok(p[id].usual.includes("nail"), `${id} contempla el clavo`);
  assert.deepEqual(p.a3.usual, ["nail"], "la obliquidad invertida se trata con clavo, no con placa lateral");
});
