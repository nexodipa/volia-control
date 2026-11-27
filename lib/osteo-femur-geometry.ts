// Geometría procedural del fémur proximal derecho para el Atlas de osteosíntesis. Sin dependencias.
// Escala: 1 unidad = 2 cm. Ejes: x = medial (+) / lateral (−), y = hacia proximal (+), z = anterior (+) / posterior (−).
// El modelo va de y = −3 (unos 6 cm bajo el trocánter menor, donde se corta el hueso) hasta la cabeza (y ≈ 12).
import {
  IDENTITY_POSE, ellipsoid, interpolateSection, loft, mergeMeshData,
  type MeshData, type Section,
} from "./osteo-geometry.ts";

const DEG = Math.PI / 180;
export const UNIT_CM = 2;
export const FEMUR_BOTTOM = -3;
export const FEMUR_TOP = 9.3;

export const FEMUR_SECTIONS: Section[] = [
  { y: FEMUR_BOTTOM, rx: 0.85, rz: 0.9 },
  { y: 2, rx: 0.85, rz: 0.92 },
  { y: 5, rx: 0.92, rz: 0.95, cx: -0.02 },
  { y: 6.4, rx: 1.05, rz: 1.0, cx: -0.12 },
  { y: 7.6, rx: 1.3, rz: 1.05, cx: -0.32 },
  { y: 8.6, rx: 1.15, rz: 0.95, cx: -0.5 },
  { y: FEMUR_TOP, rx: 0.8, rz: 0.8, cx: -0.55 },
];

/** Eje del cuello: nace en el trocánter y apunta a la cabeza (ángulo cervicodiafisario de 130°, con leve anteversión). */
export const NECK = (() => {
  const raw: [number, number, number] = [Math.sin(50 * DEG), Math.cos(50 * DEG), 0.07];
  const len = Math.hypot(...raw);
  const dir = raw.map((v) => v / len) as [number, number, number];
  const origin: [number, number, number] = [-0.1, 7.25, 0.05];
  const headT = 5.7;
  const headCenter = origin.map((o, i) => o + dir[i] * headT) as [number, number, number];
  return { origin, dir, headT, headCenter, headRadius: 1.3, tubeFrom: 0.3, tubeTo: 4.7 };
})();

export const LESSER = { center: [0.85, 5.6, -0.8] as [number, number, number], r: [0.35, 0.55, 0.35] as [number, number, number] };

export type FemurBoneZone =
  | "femur-head" | "femur-neck" | "femur-trochanter-greater" | "femur-trochanter-lesser"
  | "femur-intertrochanteric" | "femur-subtrochanteric" | "femur-shaft";

/** Límites en y entre las regiones del fémur proximal. */
export const REGIONS_Y = { shaftTop: 3.1, intertrochTop: 5.0, greaterBottom: 7.0 };

function along(p: [number, number, number]) {
  const o = NECK.origin, d = NECK.dir;
  const rel = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
  const t = rel[0] * d[0] + rel[1] * d[1] + rel[2] * d[2];
  const perp = Math.hypot(rel[0] - d[0] * t, rel[1] - d[1] * t, rel[2] - d[2] * t);
  return { t, perp };
}

/** Zona anatómica de un punto del fémur en coordenadas locales. */
export function femurZoneAt(x: number, y: number, z: number): FemurBoneZone {
  const h = NECK.headCenter;
  if (Math.hypot(x - h[0], y - h[1], z - h[2]) < NECK.headRadius + 0.15) return "femur-head";
  const { t, perp } = along([x, y, z]);
  if (t > 1.3 && perp < 1.3) return "femur-neck";
  const l = LESSER;
  if (((x - l.center[0]) / l.r[0]) ** 2 + ((y - l.center[1]) / l.r[1]) ** 2 + ((z - l.center[2]) / l.r[2]) ** 2 < 1.7) return "femur-trochanter-lesser";
  if (y >= REGIONS_Y.greaterBottom && x < 0.2) return "femur-trochanter-greater";
  if (y >= REGIONS_Y.intertrochTop) return "femur-intertrochanteric";
  if (y >= REGIONS_Y.shaftTop) return "femur-subtrochanteric";
  return "femur-shaft";
}

// ---------- Huesos ----------

/** Tubo elíptico a lo largo de un eje oblicuo (el cuello femoral). */
export function obliqueTube(
  origin: [number, number, number], dir: [number, number, number], t0: number, t1: number,
  r0: { u: number; v: number }, r1: { u: number; v: number }, rings = 12, segments = 28,
): MeshData {
  // u: dirección superior-inferior dentro del plano frontal; v: anteroposterior.
  const ul = Math.hypot(dir[1], dir[0]);
  const u: [number, number, number] = [-dir[1] / ul, dir[0] / ul, 0];
  const v: [number, number, number] = [
    dir[1] * u[2] - dir[2] * u[1], dir[2] * u[0] - dir[0] * u[2], dir[0] * u[1] - dir[1] * u[0],
  ];
  const positions: number[] = [];
  const indices: number[] = [];
  const cols = segments + 1;
  for (let r = 0; r <= rings; r++) {
    const f = r / rings;
    const t = t0 + (t1 - t0) * f;
    const ru = r0.u + (r1.u - r0.u) * f, rv = r0.v + (r1.v - r0.v) * f;
    for (let k = 0; k <= segments; k++) {
      const th = (2 * Math.PI * k) / segments;
      const c = Math.cos(th) * ru, s = Math.sin(th) * rv;
      positions.push(
        origin[0] + dir[0] * t + u[0] * c + v[0] * s,
        origin[1] + dir[1] * t + u[1] * c + v[1] * s,
        origin[2] + dir[2] * t + u[2] * c + v[2] * s,
      );
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let k = 0; k < segments; k++) {
      const i = r * cols + k;
      indices.push(i, i + cols, i + 1, i + 1, i + cols, i + cols + 1);
    }
  }
  return { positions, indices };
}

export function femoralHead(): MeshData {
  const h = NECK.headCenter;
  return ellipsoid(h[0], h[1], h[2], NECK.headRadius, NECK.headRadius, NECK.headRadius, 18);
}

export function femoralNeck(): MeshData {
  return obliqueTube(NECK.origin, NECK.dir, NECK.tubeFrom, NECK.tubeTo, { u: 1.05, v: 0.85 }, { u: 0.78, v: 0.66 }, 10, 28);
}

export function lesserTrochanter(): MeshData {
  const l = LESSER;
  return ellipsoid(l.center[0], l.center[1], l.center[2], l.r[0], l.r[1], l.r[2], 10);
}

const shaftLoft = (y0: number, y1: number, opts: { a0?: number; a1?: number } = {}): MeshData =>
  loft(FEMUR_SECTIONS, y0, y1, { cap0: "flat", cap1: "flat", rings: Math.max(2, Math.ceil((y1 - y0) / 0.5)), ...opts });

export function femurWhole(): MeshData {
  return mergeMeshData(shaftLoft(FEMUR_BOTTOM, FEMUR_TOP), femoralNeck(), femoralHead(), lesserTrochanter());
}

// ---------- Fracturas (AO/OTA 31A) ----------

export type FemurFractureId = "none" | "a1" | "a2" | "a3";
export type FemurPose = { dx: number; dy: number; dz: number; rx: number; ry: number; rz: number; pivot: [number, number, number] };
export type FemurPiece = { id: string; mesh: MeshData; displaced: FemurPose };
export type FemurFractureModel = { id: FemurFractureId; pieces: FemurPiece[] };

const MEDIAL = { a0: -90 * DEG, a1: 90 * DEG };
const LATERAL = { a0: 90 * DEG, a1: 270 * DEG };

/** Alturas de los trazos (y) en la cortical medial y en la lateral. */
export const BREAKS = {
  a1: { medial: 6.3, lateral: 7.9 },
  a2: { medial: 6.7, lateral: 7.9, lesserBottom: 5.0 },
  a3: { medial: 7.0, lateral: 4.8 },
};

/**
 * Patrones del fémur proximal: 31A1 (pertrocantérea simple, dos fragmentos), 31A2 (multifragmentaria, con el trocánter
 * menor y la cortical posteromedial sueltos) y 31A3 (de obliquidad invertida, trazo de medial alto a lateral bajo).
 * Todas las piezas se expresan en coordenadas locales del fémur.
 */
export function buildFemurFracture(id: FemurFractureId): FemurFractureModel {
  const head = () => mergeMeshData(femoralNeck(), femoralHead());
  const top = FEMUR_TOP, bottom = FEMUR_BOTTOM;

  if (id === "none") return { id, pieces: [{ id: "femur", mesh: femurWhole(), displaced: IDENTITY_POSE }] };

  if (id === "a1") {
    const { medial, lateral } = BREAKS.a1;
    return {
      id,
      pieces: [
        {
          id: "proximal",
          mesh: mergeMeshData(head(), shaftLoft(medial, top, MEDIAL), shaftLoft(lateral, top, LATERAL)),
          // Varo: la cabeza baja y el fragmento se acorta hacia el trazo.
          displaced: { dx: 0.3, dy: -0.45, dz: 0, rx: 0, ry: 0, rz: -11 * DEG, pivot: [0.7, medial, 0] },
        },
        {
          id: "distal",
          mesh: mergeMeshData(shaftLoft(bottom, medial), shaftLoft(medial, lateral, LATERAL), lesserTrochanter()),
          displaced: IDENTITY_POSE,
        },
      ],
    };
  }

  if (id === "a2") {
    const { medial, lateral, lesserBottom } = BREAKS.a2;
    const pm = { a0: -120 * DEG, a1: -10 * DEG };
    const rest = { a0: -10 * DEG, a1: 240 * DEG };
    return {
      id,
      pieces: [
        {
          id: "proximal",
          mesh: mergeMeshData(head(), shaftLoft(medial, top, MEDIAL), shaftLoft(lateral, top, LATERAL)),
          displaced: { dx: 0.3, dy: -0.5, dz: 0, rx: 0, ry: 0, rz: -10 * DEG, pivot: [0.7, medial, 0] },
        },
        {
          id: "posteromedial",
          mesh: mergeMeshData(shaftLoft(lesserBottom, medial, pm), lesserTrochanter()),
          displaced: { dx: 0.5, dy: 0, dz: -0.5, rx: 0, ry: -22 * DEG, rz: 0, pivot: [0.85, 5.8, -0.6] },
        },
        {
          id: "distal",
          mesh: mergeMeshData(shaftLoft(bottom, lesserBottom), shaftLoft(lesserBottom, medial, rest), shaftLoft(medial, lateral, LATERAL)),
          displaced: IDENTITY_POSE,
        },
      ],
    };
  }

  // a3: obliquidad invertida. El trazo va de la cortical medial (alta) a la lateral (baja, bajo el trocánter mayor).
  const { medial, lateral } = BREAKS.a3;
  return {
    id,
    pieces: [
      {
        id: "proximal",
        mesh: mergeMeshData(head(), shaftLoft(medial, top, MEDIAL), shaftLoft(lateral, top, LATERAL)),
        displaced: { dx: 0, dy: -0.3, dz: 0, rx: 0, ry: 0, rz: -6 * DEG, pivot: [0, lateral, 0] },
      },
      {
        id: "distal",
        mesh: mergeMeshData(shaftLoft(bottom, lateral), shaftLoft(lateral, medial, MEDIAL), lesserTrochanter()),
        // El fragmento distal se medializa (tracción de los aductores).
        displaced: { dx: 0.9, dy: 0, dz: 0, rx: 0, ry: 0, rz: 5 * DEG, pivot: [0, lateral, 0] },
      },
    ],
  };
}

// ---------- Referencias de corteza ----------

export function medialCortexX(y: number): number {
  const s = interpolateSection(FEMUR_SECTIONS, y);
  return (s.cx ?? 0) + s.rx;
}
export function lateralCortexX(y: number): number {
  const s = interpolateSection(FEMUR_SECTIONS, y);
  return (s.cx ?? 0) - s.rx;
}

// ---------- Implantes ----------

/** Clavo cefalomedular: entra por la punta del trocánter mayor y baja por el canal; el tornillo cefálico cruza el cuello. */
export const NAIL = {
  radius: 0.25,
  path: [[-0.3, 9.4, 0], [0, 7.0, 0], [0, -2.6, 0]] as [number, number, number][],
  /** Tornillo o espiral cefálica: de t_start (fuera de la cortical lateral) a t_end (cerca del hueso subcondral), sobre el eje del cuello. */
  lagScrew: { radius: 0.24, tStart: -1.75, tEnd: 6.7, headRadius: 0.42 },
  distalLock: { y: -1.8, radius: 0.1 },
};

/** Punto sobre el eje del cuello a distancia t del origen. */
export function neckPoint(t: number, offset: [number, number, number] = [0, 0, 0]): [number, number, number] {
  const o = NECK.origin, d = NECK.dir;
  return [o[0] + d[0] * t + offset[0], o[1] + d[1] * t + offset[1], o[2] + d[2] * t + offset[2]];
}

/** Placa lateral bloqueada de fémur proximal con tres tornillos hacia la cabeza y cuatro en la diáfisis. */
export const PLATE = {
  y: [1.4, 9.0] as [number, number],
  halfWidth: 0.42,
  thickness: 0.13,
  /** Alturas (y) donde nacen sobre la cara lateral los tres tornillos hacia la cabeza. */
  headScrews: [7.15, 6.5, 5.85] as number[],
  shaftScrews: [4.6, 3.6, 2.6, 1.7] as number[],
  headScrewRadius: 0.13,
  shaftScrewRadius: 0.1,
};

/** Cara lateral de la placa (afuera) y su apoyo en el hueso (adentro), a la altura y. */
export function plateInnerX(y: number): number { return lateralCortexX(y) - 0.02; }
export function plateOuterX(y: number): number { return plateInnerX(y) - PLATE.thickness; }

export function plateMesh(): MeshData {
  const [y0, y1] = PLATE.y;
  const rows = Math.round((y1 - y0) / 0.1);
  const cols = 4;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i <= rows; i++) {
      const y = y0 + ((y1 - y0) * i) / rows;
      const x = layer === 0 ? plateOuterX(y) : plateInnerX(y);
      for (let j = 0; j <= cols; j++) positions.push(x, y, -PLATE.halfWidth + (2 * PLATE.halfWidth * j) / cols);
    }
  }
  const per = (rows + 1) * (cols + 1);
  const at = (layer: number, i: number, j: number) => layer * per + i * (cols + 1) + j;
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const a = at(layer, i, j), b = at(layer, i, j + 1), c = at(layer, i + 1, j), d = at(layer, i + 1, j + 1);
        indices.push(a, c, b, b, c, d);
      }
    }
  }
  for (let i = 0; i < rows; i++) {
    for (const j of [0, cols]) {
      const a = at(0, i, j), b = at(0, i + 1, j), c = at(1, i, j), d = at(1, i + 1, j);
      indices.push(a, b, c, c, b, d);
    }
  }
  for (const i of [0, rows]) {
    for (let j = 0; j < cols; j++) {
      const a = at(0, i, j), b = at(0, i, j + 1), c = at(1, i, j), d = at(1, i, j + 1);
      indices.push(a, b, c, c, b, d);
    }
  }
  return { positions, indices };
}

/** Extremos de un tornillo de cabeza que sale de la placa hacia el cuello, paralelo al eje del cuello. */
export function headScrewEnds(y: number): { from: [number, number, number]; to: [number, number, number] } {
  const d = NECK.dir;
  const from: [number, number, number] = [plateOuterX(y) - 0.04, y, 0.05];
  const h = NECK.headCenter;
  const len = (h[0] - from[0]) * d[0] + (h[1] - from[1]) * d[1] + (h[2] - from[2]) * d[2] + 0.4;
  return { from, to: [from[0] + d[0] * len, from[1] + d[1] * len, from[2] + d[2] * len] };
}
