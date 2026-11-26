import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  IMPLANTS, LESSONS, MEASURES, PATTERNS, QUIZ, SOURCES, ZONES, allHecamCodes, gradeQuiz,
} from "../lib/osteo-atlas.ts";
import {
  EXFIX, KWIRES, PLATE, buildFracture, bounds, cortexZ, ellipsoid, handBones, interpolateSection, loft,
  lerpPose, mergeMeshData, plateHalfWidth, plateMesh, plateTopZ, radiusWhole, radiusZoneAt, RADIUS_SECTIONS, RADIUS_TOP, ulnaBody,
} from "../lib/osteo-geometry.ts";

const items = JSON.parse(readFileSync(new URL("../public/data/hecam-2026.json", import.meta.url), "utf8")).items;
const byCode = new Map(items.map((i) => [i.c, i]));

function validMesh(m) {
  assert.ok(m.positions.length > 0 && m.positions.length % 3 === 0);
  assert.ok(m.indices.length > 0 && m.indices.length % 3 === 0);
  assert.ok(m.positions.every(Number.isFinite), "vértices finitos");
  const n = m.positions.length / 3;
  assert.ok(m.indices.every((i) => Number.isInteger(i) && i >= 0 && i < n), "índices dentro de rango");
}

test("todos los códigos HECAM del atlas existen en la programación 2026", () => {
  for (const code of allHecamCodes()) assert.ok(byCode.has(code), `falta ${code}`);
});

test("los códigos HECAM corresponden al tipo de producto que dice el atlas", () => {
  assert.match(byCode.get("09-0358").n, /radio distal/i);
  assert.match(byCode.get("09-0844").n, /mu[ñn]eca/i);
  assert.match(byCode.get("09-0211").n, /Kirschner/i);
  assert.match(byCode.get("06-0155").n, /Kirschner/i);
  assert.match(byCode.get("09-0621").n, /fijador/i);
  assert.match(byCode.get("09-0621").n, /antebrazo/i);
});

test("cada implante tiene indicaciones, técnica, complicaciones y al menos un ítem HECAM", () => {
  for (const [id, imp] of Object.entries(IMPLANTS)) {
    assert.equal(imp.id, id);
    assert.ok(imp.indications.length && imp.technique.length && imp.complications.length && imp.hecam.length, id);
  }
});

test("las zonas están completas y los implantes que enlazan existen", () => {
  for (const [id, z] of Object.entries(ZONES)) {
    assert.equal(z.id, id);
    assert.ok(z.name && z.summary && z.points.length >= 1, id);
    if (z.implant) assert.ok(IMPLANTS[z.implant], `${id} enlaza a un implante que no existe`);
  }
});

test("los patrones usan códigos AO/OTA 2R3 y solo implantes definidos", () => {
  for (const [id, p] of Object.entries(PATTERNS)) {
    assert.equal(p.id, id);
    if (id !== "none") assert.match(p.ao, /^2R3[ABC]\d$/);
    for (const i of p.usual) assert.ok(IMPLANTS[i]);
  }
  assert.equal(PATTERNS.a2.ao, "2R3A2");
  assert.equal(PATTERNS.b3.ao, "2R3B3");
  assert.equal(PATTERNS.c2.ao, "2R3C2");
});

test("el quiz es consistente y se califica bien", () => {
  assert.ok(QUIZ.length >= 8);
  for (const q of QUIZ) {
    assert.ok(q.answer >= 0 && q.answer < q.options.length, q.q);
    assert.equal(new Set(q.options).size, q.options.length, q.q);
    assert.ok(q.why.length > 10);
  }
  const perfect = gradeQuiz(QUIZ.map((q) => q.answer));
  assert.equal(perfect.correct, QUIZ.length);
  assert.equal(perfect.pct, 100);
  const none = gradeQuiz([]);
  assert.equal(none.correct, 0);
  const half = gradeQuiz(QUIZ.map((q, i) => (i % 2 ? q.answer : (q.answer + 1) % q.options.length)));
  assert.equal(half.correct, Math.floor(QUIZ.length / 2));
});

test("las lecciones, medidas y fuentes están completas", () => {
  assert.ok(LESSONS.length >= 4 && LESSONS.every((l) => l.title && l.body.length));
  assert.equal(MEASURES.length, 5);
  assert.ok(SOURCES.every((s) => /^https:\/\//.test(s.url)));
});

test("la interpolación de secciones se queda en el rango y es continua", () => {
  const a = interpolateSection(RADIUS_SECTIONS, -5);
  const b = interpolateSection(RADIUS_SECTIONS, 99);
  assert.equal(a.rx, RADIUS_SECTIONS[0].rx);
  assert.equal(b.rx, RADIUS_SECTIONS.at(-1).rx);
  let prev = interpolateSection(RADIUS_SECTIONS, 0).rx;
  for (let y = 0.1; y <= 12; y += 0.1) {
    const cur = interpolateSection(RADIUS_SECTIONS, y).rx;
    assert.ok(Math.abs(cur - prev) < 0.12, `salto en y=${y.toFixed(1)}`);
    prev = cur;
  }
});

test("la geometría del radio, el cúbito y la mano es válida y de tamaño adulto", () => {
  const radius = radiusWhole();
  validMesh(radius);
  const { min, max } = bounds(radius);
  assert.ok(max[0] - min[0] > 2.8 && max[0] - min[0] < 3.6, "ancho distal del radio ≈ 3 cm");
  assert.ok(min[1] < -0.9, "la estiloides baja más de 1 cm bajo la superficie articular");
  assert.equal(max[1], RADIUS_TOP);
  validMesh(ulnaBody());
  for (const m of Object.values(handBones())) validMesh(m);
  validMesh(ellipsoid(0, 0, 0, 1, 1, 1));
  validMesh(mergeMeshData(ellipsoid(0, 0, 0, 1, 1, 1), ellipsoid(2, 0, 0, 1, 1, 1)));
});

test("un sector de loft cubre menos ángulo y tiene menos vértices que el anillo completo", () => {
  const whole = loft(RADIUS_SECTIONS, 0, 2, { rings: 4 });
  const part = loft(RADIUS_SECTIONS, 0, 2, { rings: 4, a0: 0, a1: Math.PI / 2 });
  validMesh(whole); validMesh(part);
  assert.ok(part.positions.length < whole.positions.length / 3);
});

test("cada patrón de fractura produce piezas válidas y su pose reducida es la identidad", () => {
  for (const id of ["none", "a2", "b3", "c2"]) {
    const model = buildFracture(id);
    assert.ok(model.pieces.length >= 1);
    for (const p of model.pieces) {
      validMesh(p.mesh);
      const z = lerpPose(p.displaced, 0);
      assert.ok([z.dx, z.dy, z.dz, z.rx, z.ry, z.rz].every((v) => v === 0));
    }
  }
  assert.equal(buildFracture("none").pieces.length, 1);
  assert.equal(buildFracture("a2").pieces.length, 2);
  assert.equal(buildFracture("b3").pieces.length, 3);
  assert.ok(buildFracture("c2").pieces.length >= 6);
});

test("en la fractura A2 el fragmento distal se acorta, se inclina al dorso y se desvía a radial", () => {
  const d = buildFracture("a2").pieces.find((p) => p.id === "distal").displaced;
  assert.ok(d.rx > 0.3, "inclinación dorsal");
  assert.ok(d.dy > 0, "acortamiento (el fragmento sube hacia proximal)");
  assert.ok(d.dz < 0, "desplazamiento dorsal");
  assert.ok(d.dx > 0, "desviación radial");
});

test("zonas del radio: cada punto cae donde corresponde", () => {
  assert.equal(radiusZoneAt(1.2, -0.5, 0), "radius-styloid");
  assert.equal(radiusZoneAt(0, 0.1, 0), "radius-articular");
  assert.equal(radiusZoneAt(0, 0.9, -0.9), "radius-lister");
  assert.equal(radiusZoneAt(0, 0.8, 0.9), "radius-volar-rim");
  assert.equal(radiusZoneAt(-1.3, 1.2, 0), "radius-sigmoid");
  assert.equal(radiusZoneAt(0, 2.5, 0.2), "radius-metaphysis");
  assert.equal(radiusZoneAt(0, 8, 0.2), "radius-shaft");
});

test("la placa sigue la cortical volar y sus tornillos están dentro de ella", () => {
  const m = plateMesh();
  validMesh(m);
  const { min, max } = bounds(m);
  assert.ok(min[1] >= PLATE.headY[0] - 1e-9 && max[1] <= PLATE.shaftY[1] + 1e-9);
  assert.ok(max[0] - min[0] > 2 * PLATE.headHalfWidth - 0.01, "cabeza ancha");
  assert.ok(plateHalfWidth(PLATE.shaftY[1]) < plateHalfWidth(PLATE.headY[0]), "cuerpo más estrecho que la cabeza");
  for (let y = PLATE.headY[0]; y <= PLATE.shaftY[1]; y += 0.5) {
    assert.ok(plateTopZ(0, y) > cortexZ(0, y), "la cara superior queda sobre el hueso");
    assert.ok(plateTopZ(0, y) - cortexZ(0, y) < 0.25, "la placa está pegada al hueso");
  }
  for (const [x, y] of PLATE.distalScrews) {
    assert.ok(Math.abs(x) < plateHalfWidth(y), "tornillo distal dentro del ancho de la placa");
    assert.ok(y > PLATE.headY[0] && y < PLATE.headY[1]);
  }
  for (const y of PLATE.proximalScrews) assert.ok(y > PLATE.shaftY[0] && y < PLATE.shaftY[1]);
});

test("las agujas cruzan el radio y el fijador deja la barra fuera del hueso", () => {
  for (const w of KWIRES) {
    const len = Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1], w.to[2] - w.from[2]);
    assert.ok(len > 2 && len < 8, "longitud razonable");
    assert.ok(w.to[1] > w.from[1], "avanzan hacia proximal");
  }
  assert.ok(EXFIX.barX > 1.6, "la barra queda por fuera del radio");
  assert.equal(EXFIX.radiusPins.length, 2);
  assert.equal(EXFIX.handPins.length, 2);
  assert.ok(EXFIX.handPins.every((y) => y < -3.4) && EXFIX.radiusPins.every((y) => y > 3));
});
