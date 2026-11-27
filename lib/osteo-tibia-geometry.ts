// Geometría procedural de la tibia y el peroné (pierna derecha) para el Atlas de osteosíntesis. Sin dependencias.
// Escala: 1 unidad = 2 cm (la tibia mide unas 18,6 unidades, es decir unos 37 cm).
// Ejes: x = lado medial (+) / lateral (−), y = hacia proximal (+) con el plafón tibial en y = 0,
// z = anterior (+) / posterior (−). El ángulo θ de cada anillo va de 0 (medial) a 90° (anterior) a 180° (lateral).
import {
  IDENTITY_POSE, cone, ellipsoid, interpolateSection, loft, mergeMeshData,
  type MeshData, type Pose, type Section,
} from "./osteo-geometry.ts";

const DEG = Math.PI / 180;
export const UNIT_CM = 2;

export const TIBIA_TOP = 18;
export const FIBULA_TOP = 16.2;

export const TIBIA_SECTIONS: Section[] = [
  { y: 0, rx: 1.25, rz: 0.95, cx: 0.1 },
  { y: 1.5, rx: 1.15, rz: 0.88, cx: 0.05 },
  { y: 3.4, rx: 0.88, rz: 0.74 },
  { y: 6, rx: 0.74, rz: 0.78 },
  { y: 10, rx: 0.72, rz: 0.82 },
  { y: 13.6, rx: 0.86, rz: 0.96 },
  { y: 16, rx: 1.42, rz: 1.14 },
  { y: 17.5, rx: 1.9, rz: 1.3 },
  { y: 18, rx: 1.9, rz: 1.3 },
];

export const FIBULA_SECTIONS: Section[] = [
  { y: -0.7, rx: 0.34, rz: 0.42, cx: -1.5, cz: -0.4 },
  { y: 0.9, rx: 0.34, rz: 0.4, cx: -1.5, cz: -0.4 },
  { y: 3, rx: 0.21, rz: 0.28, cx: -1.25, cz: -0.25 },
  { y: 8, rx: 0.2, rz: 0.25, cx: -1.17, cz: -0.32 },
  { y: 13, rx: 0.22, rz: 0.26, cx: -1.3, cz: -0.42 },
  { y: 15.2, rx: 0.4, rz: 0.4, cx: -1.85, cz: -0.5 },
  { y: FIBULA_TOP, rx: 0.36, rz: 0.36, cx: -1.85, cz: -0.5 },
];

// ---------- Zonas ----------

export type TibiaBoneZone =
  | "tibia-tuberosity" | "tibia-malleolus-medial"
  | "tibia-plateau" | "tibia-metaphysis-prox" | "tibia-shaft-prox" | "tibia-shaft-mid" | "tibia-shaft-dist"
  | "tibia-pilon" | "fibula-head" | "fibula-shaft" | "fibula-malleolus";

/** Límites de los tercios de la diáfisis (y), en unidades de 2 cm. */
export const THIRDS = { pilonTop: 3.4, distalTop: 7, midTop: 10.6, proximalTop: 14.2, plateauBottom: 16.4 };

/** Zona anatómica de un punto de la tibia en coordenadas locales. */
export function tibiaZoneAt(x: number, y: number, z: number): TibiaBoneZone {
  // El maléolo medial es lo único que baja del plafón (y < 0); la tuberosidad es la protuberancia delantera.
  if (y < -0.01) return "tibia-malleolus-medial";
  if (y > 14.6 && y < 16.1 && z > 1.1 && Math.abs(x) < 0.5) return "tibia-tuberosity";
  if (y >= THIRDS.plateauBottom) return "tibia-plateau";
  if (y >= THIRDS.proximalTop) return "tibia-metaphysis-prox";
  if (y >= THIRDS.midTop) return "tibia-shaft-prox";
  if (y >= THIRDS.distalTop) return "tibia-shaft-mid";
  if (y >= THIRDS.pilonTop) return "tibia-shaft-dist";
  return "tibia-pilon";
}

export function fibulaZoneAt(_x: number, y: number): TibiaBoneZone {
  if (y > 14.6) return "fibula-head";
  if (y < 1.2) return "fibula-malleolus";
  return "fibula-shaft";
}

// ---------- Huesos ----------

/** Maléolo medial: cono que baja por debajo del plafón en el lado medial. */
export function medialMalleolus(): MeshData {
  return cone(0.98, 0.05, -0.85, 0.4, 0.12, 0.45);
}

/** Tuberosidad tibial anterior: prominencia donde se inserta el tendón rotuliano. */
export function tibialTuberosity(): MeshData {
  return ellipsoid(0.05, 15.35, 1.0, 0.36, 0.7, 0.28, 12);
}

/** Eminencia intercondílea (espinas tibiales) en el centro de la meseta. */
export function intercondylarEminence(): MeshData {
  return mergeMeshData(ellipsoid(0.28, 18.15, 0, 0.18, 0.2, 0.2, 10), ellipsoid(-0.28, 18.15, 0, 0.18, 0.2, 0.2, 10));
}

export function tibiaWhole(): MeshData {
  return mergeMeshData(
    loft(TIBIA_SECTIONS, 0, TIBIA_TOP, { cap0: "flat", cap1: "dished", dish: -0.18, rings: 64 }),
    medialMalleolus(),
    tibialTuberosity(),
    intercondylarEminence(),
  );
}

export function fibulaBody(): MeshData {
  return loft(FIBULA_SECTIONS, -0.7, FIBULA_TOP, { cap0: "flat", cap1: "flat", rings: 50 });
}

// ---------- Fracturas de la diáfisis ----------

export type TibiaFractureId = "none" | "a3" | "b2" | "c2";

export type TibiaPiece = { id: string; mesh: MeshData; displaced: Pose };
export type TibiaFractureModel = { id: TibiaFractureId; pieces: TibiaPiece[] };

const sector = (a: number, b: number) => ({ a0: a * DEG, a1: b * DEG });
const rest = (a: number, b: number) => ({ a0: b * DEG, a1: (a + 360) * DEG });

/** Nivel de la fractura en el tercio medio (y). */
export const FRACTURE_Y = 9;

/**
 * Patrones de la diáfisis tibial (AO/OTA 42): A3 simple transversa, B2 en cuña por flexión (mariposa) y
 * C2 compleja segmentaria. Todas las piezas se expresan en coordenadas locales de la tibia.
 */
export function buildTibiaFracture(id: TibiaFractureId): TibiaFractureModel {
  const top = TIBIA_TOP;
  const head = (from: number) => mergeMeshData(loft(TIBIA_SECTIONS, from, top, { cap0: "flat", cap1: "dished", dish: -0.18, rings: 40 }), tibialTuberosity(), intercondylarEminence());
  const foot = (to: number) => mergeMeshData(loft(TIBIA_SECTIONS, 0, to, { cap0: "flat", cap1: "flat", rings: 32 }), medialMalleolus());

  if (id === "none") return { id, pieces: [{ id: "tibia", mesh: tibiaWhole(), displaced: IDENTITY_POSE }] };

  if (id === "a3") {
    // Trazo transverso: el fragmento distal se acorta, se desvía a varo y se desplaza hacia medial y posterior.
    const y = FRACTURE_Y;
    return {
      id,
      pieces: [
        { id: "proximal", mesh: head(y), displaced: IDENTITY_POSE },
        { id: "distal", mesh: foot(y), displaced: { dx: 0.55, dy: 0.35, dz: -0.3, rx: 6 * DEG, ry: 0, rz: -10 * DEG, pivot: [0, y, 0] } },
      ],
    };
  }

  if (id === "b2") {
    // Cuña de flexión: la «mariposa» queda en el lado de la tensión (lateral) y los dos fragmentos principales se
    // angulan en torno a ella.
    const wedge = sector(145, 215);
    const notWedge = rest(145, 215);
    const y = FRACTURE_Y;
    const y0 = y - 1.0;
    const y1 = y + 1.4;
    return {
      id,
      pieces: [
        {
          id: "proximal",
          mesh: mergeMeshData(head(y1), loft(TIBIA_SECTIONS, y, y1, { ...notWedge, cap0: "flat", rings: 5 })),
          displaced: IDENTITY_POSE,
        },
        {
          id: "distal",
          mesh: mergeMeshData(foot(y0), loft(TIBIA_SECTIONS, y0, y, { ...notWedge, cap1: "flat", rings: 4 })),
          displaced: { dx: 0.25, dy: 0.2, dz: -0.2, rx: 4 * DEG, ry: 0, rz: -9 * DEG, pivot: [0, y, 0] },
        },
        {
          id: "cuna",
          mesh: loft(TIBIA_SECTIONS, y0, y1, { ...wedge, cap0: "flat", cap1: "flat", rings: 8 }),
          displaced: { dx: -0.55, dy: -0.15, dz: -0.1, rx: 0, ry: 0, rz: 22 * DEG, pivot: [-0.7, y + 0.2, 0] },
        },
      ],
    };
  }

  // c2: segmento intermedio de unos 6 cm, libre, con los dos extremos desalineados.
  const segBottom = 7.4;
  const segTop = 10.6;
  return {
    id,
    pieces: [
      { id: "proximal", mesh: head(segTop), displaced: { dx: 0, dy: 0, dz: 0.15, rx: -4 * DEG, ry: 0, rz: 0, pivot: [0, segTop, 0] } },
      { id: "segmento", mesh: loft(TIBIA_SECTIONS, segBottom, segTop, { cap0: "flat", cap1: "flat", rings: 12 }), displaced: { dx: -0.6, dy: 0, dz: 0.2, rx: 0, ry: 14 * DEG, rz: 12 * DEG, pivot: [0, (segBottom + segTop) / 2, 0] } },
      { id: "distal", mesh: foot(segBottom), displaced: { dx: 0.65, dy: 0.5, dz: -0.35, rx: 7 * DEG, ry: -8 * DEG, rz: -11 * DEG, pivot: [0, segBottom, 0] } },
    ],
  };
}

// ---------- Implantes ----------

/** Clavo endomedular de 9 mm con su curva proximal, entrando por delante de la meseta. */
export const NAIL = {
  radius: 0.22,
  /** Puntos de la trayectoria (x, y, z) de proximal a distal. */
  path: [[0, 17.5, 1.05], [0, 15.4, 0.4], [0, 1.4, 0]] as [number, number, number][],
  /** Tornillos de bloqueo (y de la altura): de lado a lado (eje x) o de delante atrás (eje z). */
  proximalLocks: [{ y: 16.1, axis: "x" }, { y: 14.9, axis: "x" }] as { y: number; axis: "x" | "z" }[],
  distalLocks: [{ y: 2.3, axis: "x" }, { y: 3.5, axis: "z" }] as { y: number; axis: "x" | "z" }[],
  screwRadius: 0.1,
};

/** Posición (z) del eje del clavo a la altura y, siguiendo su trayectoria. */
export function nailZ(y: number): number {
  const pts = NAIL.path;
  for (let i = 0; i < pts.length - 1; i++) {
    const [, ya, za] = pts[i];
    const [, yb, zb] = pts[i + 1];
    if (y <= ya && y >= yb) return za + ((zb - za) * (ya - y)) / (ya - yb);
  }
  return y > pts[0][1] ? pts[0][2] : pts[pts.length - 1][2];
}

/** Placa medial en puente sobre la diáfisis: tres tornillos a cada lado del foco (que está en y = 9). */
export const PLATE = {
  y: [4.2, 13.8] as [number, number],
  halfWidth: 0.34,
  thickness: 0.12,
  screws: [4.8, 5.9, 7.0, 11.0, 12.1, 13.2] as number[],
  screwRadius: 0.09,
};

/** Cara medial de la tibia en (y): x del borde de la cortical. */
export function medialCortexX(y: number): number {
  const sec = interpolateSection(TIBIA_SECTIONS, y);
  return (sec.cx ?? 0) + sec.rx;
}

/** Cara lateral de la tibia en (y). */
export function lateralCortexX(y: number): number {
  const sec = interpolateSection(TIBIA_SECTIONS, y);
  return (sec.cx ?? 0) - sec.rx;
}

/** Cara lateral de la tibia a la altura y y a la profundidad z (para pines que no pasan por el centro). */
export function lateralCortexXAt(y: number, z: number): number {
  const sec = interpolateSection(TIBIA_SECTIONS, y);
  const k = Math.min(1, Math.abs(z - (sec.cz ?? 0)) / sec.rz);
  return (sec.cx ?? 0) - sec.rx * Math.sqrt(1 - k * k);
}

/** Bordes anterior y posterior de la tibia en (y) (z). */
export function anteriorCortexZ(y: number): number {
  const sec = interpolateSection(TIBIA_SECTIONS, y);
  return (sec.cz ?? 0) + sec.rz;
}
export function posteriorCortexZ(y: number): number {
  const sec = interpolateSection(TIBIA_SECTIONS, y);
  return (sec.cz ?? 0) - sec.rz;
}

/** Fijador externo uniplanar: dos pines por fragmento unidos a una barra medial. */
export const EXFIX = {
  barX: 2.9,
  barZ: 0.5,
  barY: [3.2, 14.6] as [number, number],
  barRadius: 0.14,
  pinRadius: 0.1,
  pins: [3.6, 4.9, 12.9, 14.2] as number[],
};

/** Malla de la placa medial, pegada a la cortical. */
export function plateMesh(): MeshData {
  const [y0, y1] = PLATE.y;
  const rows = Math.round((y1 - y0) / 0.1);
  const cols = 4;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i <= rows; i++) {
      const y = y0 + ((y1 - y0) * i) / rows;
      const x = medialCortexX(y) + 0.02 + (layer === 0 ? PLATE.thickness : 0);
      for (let j = 0; j <= cols; j++) {
        positions.push(x, y, -PLATE.halfWidth + (2 * PLATE.halfWidth * j) / cols);
      }
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
