import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ATLAS_REGIONS, RADIUS_REGION, atlasRegion } from "../lib/osteo-regions.ts";
import { TIBIA_REGION } from "../lib/osteo-tibia.ts";
import { gradeRegionQuiz, regionHecamCodes, validateRegion } from "../lib/osteo-region.ts";
import { interpolateSection } from "../lib/osteo-geometry.ts";
import {
  EXFIX, FRACTURE_Y, NAIL, PLATE, TIBIA_SECTIONS, TIBIA_TOP,
  anteriorCortexZ, buildTibiaFracture, fibulaBody, fibulaZoneAt, lateralCortexX, lateralCortexXAt, medialCortexX, nailZ,
  plateMesh, posteriorCortexZ, tibiaWhole, tibiaZoneAt,
} from "../lib/osteo-tibia-geometry.ts";

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

test("todas las regiones del atlas tienen contenido coherente", () => {
  assert.deepEqual(ATLAS_REGIONS.map((r) => r.id), ["radius", "tibia"]);
  for (const r of ATLAS_REGIONS) assert.deepEqual(validateRegion(r), [], r.id);
  assert.equal(atlasRegion("tibia"), TIBIA_REGION);
  assert.equal(atlasRegion("no-existe"), RADIUS_REGION);
});

test("los códigos HECAM de la tibia existen y son del tipo de producto que dice el atlas", () => {
  for (const code of regionHecamCodes(TIBIA_REGION)) assert.ok(byCode.has(code), `falta ${code}`);
  assert.match(byCode.get("09-0200").n, /clavo endomedular.*tibia/i);
  assert.match(byCode.get("09-0213").n, /el[aá]sticos/i);
  assert.match(byCode.get("09-0360").n, /LCP estrecha/i);
  assert.match(byCode.get("09-0336").n, /tibia distal medial/i);
  assert.match(byCode.get("09-0752").n, /tibia distal medial/i);
  assert.match(byCode.get("09-0359").n, /tibia distal/i);
  assert.match(byCode.get("09-0626").n, /lineales para tibia/i);
  assert.match(byCode.get("09-0686").n, /Ilizarov/i);
});

test("el atlas dice la verdad sobre el clavo tibial: no hay un sistema de clavo tibial estándar en el HECAM", () => {
  const nails = items.filter((i) => /clavo/i.test(i.n) && /tibia/i.test(i.n));
  assert.deepEqual(nails.map((i) => i.c), ["09-0200"]);
  assert.match(TIBIA_REGION.zones.nail.points.join(" "), /09-0200/);
});

test("el quiz de la tibia se califica y tiene preguntas con una sola respuesta correcta", () => {
  assert.ok(TIBIA_REGION.quiz.length >= 10);
  const perfect = TIBIA_REGION.quiz.map((q) => q.answer);
  assert.deepEqual(gradeRegionQuiz(TIBIA_REGION, perfect), { correct: TIBIA_REGION.quiz.length, total: TIBIA_REGION.quiz.length, pct: 100 });
  assert.equal(gradeRegionQuiz(TIBIA_REGION, []).correct, 0);
  // La respuesta correcta no cae siempre en la misma posición.
  assert.ok(new Set(TIBIA_REGION.quiz.map((q) => q.answer)).size >= 3);
});

test("la tibia, el peroné y las fracturas generan mallas válidas", () => {
  validMesh(tibiaWhole(), "tibia");
  validMesh(fibulaBody(), "peroné");
  validMesh(plateMesh(), "placa");
  for (const id of ["none", "a3", "b2", "c2"]) {
    const model = buildTibiaFracture(id);
    assert.equal(model.id, id);
    for (const p of model.pieces) validMesh(p.mesh, `${id}/${p.id}`);
  }
  assert.equal(buildTibiaFracture("none").pieces.length, 1);
  assert.equal(buildTibiaFracture("a3").pieces.length, 2);
  assert.equal(buildTibiaFracture("b2").pieces.length, 3);
  assert.equal(buildTibiaFracture("c2").pieces.length, 3);
});

test("las fracturas parten la tibia a la altura esperada y juntas cubren todo el hueso", () => {
  const [wholeLo, wholeHi] = yRange(tibiaWhole());
  for (const id of ["a3", "b2", "c2"]) {
    const pieces = buildTibiaFracture(id).pieces;
    const lo = Math.min(...pieces.map((p) => yRange(p.mesh)[0]));
    const hi = Math.max(...pieces.map((p) => yRange(p.mesh)[1]));
    assert.ok(Math.abs(lo - wholeLo) < 1e-6 && Math.abs(hi - wholeHi) < 1e-6, id);
  }
  const a3 = buildTibiaFracture("a3").pieces;
  assert.ok(Math.abs(yRange(a3[0].mesh)[0] - FRACTURE_Y) < 1e-6, "proximal empieza en el foco");
  assert.ok(Math.abs(yRange(a3[1].mesh)[1] - FRACTURE_Y) < 1e-6, "distal termina en el foco");
  // Cada patrón desplaza al menos un fragmento.
  for (const id of ["a3", "b2", "c2"]) {
    const moved = buildTibiaFracture(id).pieces.filter((p) => p.displaced.dx || p.displaced.dy || p.displaced.dz || p.displaced.rx || p.displaced.ry || p.displaced.rz);
    assert.ok(moved.length >= 1, id);
  }
});

test("las zonas del hueso son las que el atlas describe", () => {
  const ids = new Set(Object.keys(TIBIA_REGION.zones));
  const probes = [
    [0, 17.5, 0], [0, 15.4, 0], [0, 12, 0], [0, 9, 0], [0, 5, 0], [0, 1.5, 0],
    [0.98, -0.5, 0.05], [0.05, 15.4, 1.25],
  ];
  const got = probes.map(([x, y, z]) => tibiaZoneAt(x, y, z));
  assert.deepEqual(got, [
    "tibia-plateau", "tibia-metaphysis-prox", "tibia-shaft-prox", "tibia-shaft-mid", "tibia-shaft-dist", "tibia-pilon",
    "tibia-malleolus-medial", "tibia-tuberosity",
  ]);
  for (const z of got) assert.ok(ids.has(z), z);
  for (const y of [16, 8, 0.2]) assert.ok(ids.has(fibulaZoneAt(-1.5, y, -0.4)), `peroné y=${y}`);
  assert.equal(fibulaZoneAt(0, 16, 0), "fibula-head");
  assert.equal(fibulaZoneAt(0, 0.5, 0), "fibula-malleolus");
  assert.equal(fibulaZoneAt(0, 8, 0), "fibula-shaft");
});

test("el clavo cabe dentro del canal en toda su trayectoria y sus tornillos cruzan el clavo", () => {
  assert.ok(NAIL.radius * 2 * UNIT * 10 >= 8 && NAIL.radius * 2 * UNIT * 10 <= 10, "unos 9 mm");
  for (let y = NAIL.path[2][1]; y <= NAIL.path[1][1]; y += 0.25) {
    const sec = interpolateSection(TIBIA_SECTIONS, y);
    const z = nailZ(y);
    assert.ok(Math.abs(z - (sec.cz ?? 0)) + NAIL.radius < sec.rz, `en y=${y} el clavo sale por delante o detrás`);
    assert.ok(NAIL.radius < sec.rx, `en y=${y} el clavo sale de lado`);
  }
  assert.equal(nailZ(NAIL.path[0][1]), NAIL.path[0][2]);
  assert.equal(nailZ(NAIL.path[2][1]), NAIL.path[2][2]);
  assert.ok(nailZ(16) > nailZ(15.4), "la curva proximal va hacia delante");
  assert.equal(NAIL.proximalLocks.length, 2);
  assert.equal(NAIL.distalLocks.length, 2);
  for (const l of NAIL.proximalLocks) assert.ok(l.y > FRACTURE_Y + 3 && l.y < NAIL.path[0][1], "proximales por encima del foco");
  for (const l of NAIL.distalLocks) assert.ok(l.y < FRACTURE_Y - 3 && l.y > NAIL.path[2][1] - 0.5, "distales por debajo del foco");
  // El clavo termina a unos 3 cm del plafón, no dentro de la articulación.
  assert.ok(NAIL.path[2][1] > 0.5 && NAIL.path[2][1] * 2 < 4);
});

test("la placa cubre el foco con tres tornillos a cada lado y no atraviesa ni la cuña ni el segmento", () => {
  assert.ok(PLATE.y[0] < FRACTURE_Y && PLATE.y[1] > FRACTURE_Y);
  const below = PLATE.screws.filter((y) => y < FRACTURE_Y);
  const above = PLATE.screws.filter((y) => y > FRACTURE_Y);
  assert.equal(below.length, 3);
  assert.equal(above.length, 3);
  for (const y of PLATE.screws) assert.ok(y > PLATE.y[0] && y < PLATE.y[1], `tornillo y=${y} dentro de la placa`);
  // Zonas del foco en la cuña (b2: 8 a 10,4) y en el segmento (c2: 7,4 a 10,6).
  for (const y of PLATE.screws) assert.ok(y < 7.4 || y > 10.6, `tornillo y=${y} fuera del segmento`);
  // La placa se apoya en la cortical medial.
  const m = plateMesh();
  for (let i = 0; i < m.positions.length; i += 3) {
    const x = m.positions[i], y = m.positions[i + 1];
    assert.ok(x >= medialCortexX(y) && x <= medialCortexX(y) + 0.2, `placa a ${x} en y=${y}`);
  }
});

test("el fijador externo cabe a cada lado del foco, fuera de la cuña y del segmento", () => {
  const below = EXFIX.pins.filter((y) => y < FRACTURE_Y);
  const above = EXFIX.pins.filter((y) => y > FRACTURE_Y);
  assert.equal(below.length, 2);
  assert.equal(above.length, 2);
  for (const y of EXFIX.pins) assert.ok(y < 7.4 || y > 10.6, `pin y=${y}`);
  assert.ok(EXFIX.barY[0] <= Math.min(...EXFIX.pins) && EXFIX.barY[1] >= Math.max(...EXFIX.pins));
  // La barra queda fuera del hueso (a medial) y los pines llegan hasta la cortical lateral.
  for (let y = 3; y <= 15; y += 1) {
    assert.ok(EXFIX.barX > medialCortexX(y) + 0.5, `barra pegada al hueso en y=${y}`);
    assert.ok(lateralCortexXAt(y, EXFIX.barZ) <= 0, "cortical lateral al otro lado del eje");
  }
});

test("las referencias de corteza son coherentes", () => {
  for (let y = 0; y <= TIBIA_TOP; y += 1) {
    assert.ok(medialCortexX(y) > lateralCortexX(y));
    assert.ok(anteriorCortexZ(y) > posteriorCortexZ(y));
    assert.ok(Math.abs(lateralCortexXAt(y, 0) - lateralCortexX(y)) < 1e-9);
    assert.ok(lateralCortexXAt(y, 0.5) >= lateralCortexX(y) - 1e-9, "la cortical lateral a z=0,5 no queda más afuera que a z=0");
  }
});

test("los patrones de la tibia describen los códigos AO/OTA 42 que dibuja el modelo", () => {
  const p = TIBIA_REGION.patterns;
  assert.equal(p.a3.ao, "42A3");
  assert.equal(p.b2.ao, "42B2");
  assert.equal(p.c2.ao, "42C2");
  for (const id of ["a3", "b2", "c2"]) assert.ok(p[id].usual.includes("nail"), `${id} contempla el clavo`);
  assert.ok(p.c2.usual.includes("exfix"), "la segmentaria contempla el fijador de control de daños");
});
