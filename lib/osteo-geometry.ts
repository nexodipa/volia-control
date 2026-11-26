// Geometría procedural del Atlas de osteosíntesis. Sin dependencias: devuelve listas planas de vértices e
// índices que el componente convierte en BufferGeometry. Unidades en centímetros.
// Ejes: x = lado radial (+) / cubital (−), y = hacia proximal (+) con la superficie articular en y = 0,
// z = lado volar (+) / dorsal (−). El ángulo θ de cada anillo va de 0 (radial) a 90° (volar) a 270° (dorsal).

export type MeshData = { positions: number[]; indices: number[] };
export type Section = { y: number; rx: number; rz: number; cx?: number; cz?: number };
export type Pose = { dx: number; dy: number; dz: number; rx: number; ry: number; rz: number; pivot: [number, number, number] };

export const IDENTITY_POSE: Pose = { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0, pivot: [0, 0, 0] };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;

/** Sección interpolada (suavizada con coseno) a la altura y; fuera del rango se queda en el extremo. */
export function interpolateSection(sections: Section[], y: number): Section {
  const s = [...sections].sort((a, b) => a.y - b.y);
  if (y <= s[0].y) return { ...s[0], y };
  if (y >= s[s.length - 1].y) return { ...s[s.length - 1], y };
  let i = 0;
  while (i < s.length - 2 && y > s[i + 1].y) i++;
  const a = s[i], b = s[i + 1];
  const t = smooth((y - a.y) / (b.y - a.y));
  return {
    y,
    rx: lerp(a.rx, b.rx, t),
    rz: lerp(a.rz, b.rz, t),
    cx: lerp(a.cx ?? 0, b.cx ?? 0, t),
    cz: lerp(a.cz ?? 0, b.cz ?? 0, t),
  };
}

export type LoftOptions = {
  /** Ángulos del sector en radianes. Por omisión, el anillo completo. */
  a0?: number; a1?: number;
  rings?: number;
  /** Tapa en y0 (extremo distal) o en y1: plana, cóncava (superficie articular) o ninguna. */
  cap0?: "flat" | "dished" | null;
  cap1?: "flat" | "dished" | null;
  /** Cuánto se hunde el centro de la tapa cóncava. */
  dish?: number;
};

/** Cuerpo hueco que sigue las secciones elípticas entre y0 e y1 (y0 < y1), opcionalmente solo un sector. */
export function loft(sections: Section[], y0: number, y1: number, opts: LoftOptions = {}): MeshData {
  const a0 = opts.a0 ?? 0;
  const a1 = opts.a1 ?? Math.PI * 2;
  const segments = Math.max(3, Math.ceil((48 * Math.abs(a1 - a0)) / (Math.PI * 2)));
  const rings = Math.max(2, opts.rings ?? Math.max(2, Math.ceil((y1 - y0) / 0.35)));
  const dish = opts.dish ?? 0.22;
  const positions: number[] = [];
  const indices: number[] = [];
  const cols = segments + 1;

  for (let r = 0; r <= rings; r++) {
    const y = lerp(y0, y1, r / rings);
    const sec = interpolateSection(sections, y);
    for (let k = 0; k <= segments; k++) {
      const th = lerp(a0, a1, k / segments);
      positions.push((sec.cx ?? 0) + sec.rx * Math.cos(th), y, (sec.cz ?? 0) + sec.rz * Math.sin(th));
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let k = 0; k < segments; k++) {
      const i = r * cols + k;
      indices.push(i, i + cols, i + 1, i + 1, i + cols, i + cols + 1);
    }
  }

  const addCap = (y: number, kind: "flat" | "dished", ringIndex: number) => {
    const sec = interpolateSection(sections, y);
    const center = positions.length / 3;
    positions.push(sec.cx ?? 0, kind === "dished" ? y + dish : y, sec.cz ?? 0);
    for (let k = 0; k < segments; k++) {
      const i = ringIndex * cols + k;
      indices.push(center, i, i + 1);
    }
  };
  if (opts.cap0) addCap(y0, opts.cap0, 0);
  if (opts.cap1) addCap(y1, opts.cap1, rings);
  return { positions, indices };
}

/** Elipsoide (huesos del carpo, cabezas óseas). */
export function ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, seg = 18): MeshData {
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const phi = (Math.PI * i) / seg;
    for (let j = 0; j <= seg * 2; j++) {
      const th = (Math.PI * j) / seg;
      positions.push(cx + rx * Math.sin(phi) * Math.cos(th), cy + ry * Math.cos(phi), cz + rz * Math.sin(phi) * Math.sin(th));
    }
  }
  const cols = seg * 2 + 1;
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < seg * 2; j++) {
      const a = i * cols + j;
      indices.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
    }
  }
  return { positions, indices };
}

/** Cono truncado a lo largo de y (estiloides). r0 en y0 (punta), r1 en y1. */
export function cone(cx: number, cz: number, y0: number, y1: number, r0: number, r1: number): MeshData {
  return loft(
    [{ y: y0, rx: r0, rz: r0, cx, cz }, { y: y1, rx: r1, rz: r1, cx, cz }],
    y0, y1, { rings: 4, cap0: "flat" },
  );
}

export function mergeMeshData(...parts: MeshData[]): MeshData {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const p of parts) {
    const base = positions.length / 3;
    for (const v of p.positions) positions.push(v);
    for (const i of p.indices) indices.push(i + base);
  }
  return { positions, indices };
}

export function bounds(m: MeshData) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], m.positions[i + a]);
      max[a] = Math.max(max[a], m.positions[i + a]);
    }
  }
  return { min, max };
}

// ---------- Anatomía del radio y del cúbito (esquemática, a escala aproximada de adulto) ----------

export const RADIUS_SECTIONS: Section[] = [
  { y: 0, rx: 1.5, rz: 0.95 },
  { y: 0.6, rx: 1.46, rz: 0.95 },
  { y: 1.6, rx: 1.3, rz: 0.88 },
  { y: 3.2, rx: 0.95, rz: 0.78 },
  { y: 5.5, rx: 0.65, rz: 0.62 },
  { y: 9, rx: 0.55, rz: 0.55 },
  { y: 12, rx: 0.55, rz: 0.55 },
];

export const ULNA_SECTIONS: Section[] = [
  { y: 0.1, rx: 0.82, rz: 0.82 },
  { y: 0.9, rx: 0.78, rz: 0.78 },
  { y: 2.2, rx: 0.52, rz: 0.52 },
  { y: 5, rx: 0.44, rz: 0.46 },
  { y: 12, rx: 0.5, rz: 0.5 },
];

export const RADIUS_TOP = 10.5;
export const RADIUS_CENTER_X = 0.9;
export const ULNA_CENTER_X = -1.55;

const DEG = Math.PI / 180;

/** Estiloides radial: cono que sobresale unos 1,1 cm por debajo de la superficie articular, en el lado radial. */
export function radialStyloid(): MeshData {
  return cone(1.05, 0, -1.1, 0.7, 0.12, 0.5);
}

/** Tubérculo de Lister: prominencia dorsal del radio distal. */
export function listerTubercle(): MeshData {
  return ellipsoid(0.05, 0.95, -0.98, 0.32, 0.34, 0.2, 12);
}

export function ulnaStyloid(): MeshData {
  return cone(-0.52, -0.3, -0.55, 0.5, 0.09, 0.3);
}

/** Todo el radio sin fractura, de la superficie articular hacia arriba. */
export function radiusWhole(): MeshData {
  return mergeMeshData(
    loft(RADIUS_SECTIONS, 0, RADIUS_TOP, { cap0: "dished", rings: 36 }),
    radialStyloid(),
    listerTubercle(),
  );
}

export function ulnaBody(): MeshData {
  return loft(ULNA_SECTIONS, 0.1, RADIUS_TOP, { cap0: "dished", dish: 0.12, rings: 34 });
}

// ---------- Zonas del radio (para pintar y para identificar el sitio tocado) ----------

export type RadiusZone =
  | "radius-shaft" | "radius-metaphysis" | "radius-articular" | "radius-styloid"
  | "radius-sigmoid" | "radius-lister" | "radius-volar-rim";

/** Zona anatómica de un punto en coordenadas locales del radio (centro del radio en x = 0). */
export function radiusZoneAt(x: number, y: number, z: number): RadiusZone {
  if (y < 0.7 && x > 0.6) return "radius-styloid";
  if (z < -0.55 && y > 0.5 && y < 1.7 && Math.abs(x) < 0.55) return "radius-lister";
  if (y < 0.3) return "radius-articular";
  if (z > 0.55 && y < 1.1) return "radius-volar-rim";
  if (x < -0.75 && y < 1.7) return "radius-sigmoid";
  if (y < 3.8) return "radius-metaphysis";
  return "radius-shaft";
}

// ---------- Fracturas del radio distal ----------

export type FractureId = "none" | "a2" | "b3" | "c2";

export type Piece = {
  id: string;
  mesh: MeshData;
  /** Posición desplazada (la fractura sin reducir). La reducida es la identidad. */
  displaced: Pose;
};

export type FractureModel = {
  id: FractureId;
  pieces: Piece[];
  /** Cómo se mueve la mano (carpo y metacarpiano) con la fractura sin reducir. */
  hand: Pose;
};

const sector = (a: number, b: number) => ({ a0: a * DEG, a1: b * DEG });

/**
 * Modelo de cada patrón. Todas las piezas se expresan en coordenadas locales del radio y su pose desplazada
 * se aplica alrededor de un pivote. Los patrones siguen la clasificación AO/OTA 2R3.
 */
export function buildFracture(id: FractureId): FractureModel {
  const top = RADIUS_TOP;
  const lister = listerTubercle();
  const styloid = radialStyloid();
  const handNone = IDENTITY_POSE;

  if (id === "none") {
    return { id, pieces: [{ id: "radio", mesh: radiusWhole(), displaced: IDENTITY_POSE }], hand: handNone };
  }

  if (id === "a2") {
    // Extraarticular, simple, trazo transverso metafisario a 2,3 cm de la articulación; el fragmento distal se
    // inclina al dorso, se acorta y se desplaza al lado radial (la «deformidad en dorso de tenedor»).
    const cut = 2.3;
    const pose: Pose = { dx: 0.3, dy: 0.45, dz: -0.45, rx: 28 * DEG, ry: 0, rz: 8 * DEG, pivot: [0, cut, 0.9] };
    return {
      id,
      pieces: [
        { id: "proximal", mesh: loft(RADIUS_SECTIONS, cut, top, { cap0: "flat", rings: 28 }), displaced: IDENTITY_POSE },
        {
          id: "distal",
          mesh: mergeMeshData(loft(RADIUS_SECTIONS, 0, cut, { cap0: "dished", cap1: "flat", rings: 10 }), styloid, lister),
          displaced: pose,
        },
      ],
      hand: pose,
    };
  }

  if (id === "b3") {
    // Parcial articular: fragmento del borde volar (frontal) que arrastra al carpo hacia volar y proximal.
    const rimTop = 1.5;
    const volar = sector(48, 132);
    const rest = { a0: 132 * DEG, a1: (48 + 360) * DEG };
    const pose: Pose = { dx: 0, dy: 0.5, dz: 0.45, rx: -22 * DEG, ry: 0, rz: 0, pivot: [0, rimTop, 0.9] };
    return {
      id,
      pieces: [
        { id: "proximal", mesh: loft(RADIUS_SECTIONS, rimTop, top, { rings: 30 }), displaced: IDENTITY_POSE },
        {
          id: "distal",
          mesh: mergeMeshData(loft(RADIUS_SECTIONS, 0, rimTop, { ...rest, cap0: "dished", rings: 6 }), styloid, lister),
          displaced: IDENTITY_POSE,
        },
        { id: "borde-volar", mesh: loft(RADIUS_SECTIONS, 0, rimTop, { ...volar, rings: 6, cap0: "dished" }), displaced: pose },
      ],
      hand: { dx: 0, dy: 0.35, dz: 0.55, rx: -10 * DEG, ry: 0, rz: 0, pivot: [0, 0, 0] },
    };
  }

  // c2: articular completa; la superficie articular se parte en un plano sagital (escafoides / semilunar) y la
  // metáfisis dorsal está conminuta en tres fragmentos.
  const art = 1.0;
  const metTop = 2.4;
  const dorsal = sector(215, 325);
  const notDorsal = { a0: 325 * DEG, a1: (215 + 360) * DEG };
  const radial = { a0: -90 * DEG, a1: 90 * DEG };
  const ulnar = { a0: 90 * DEG, a1: 270 * DEG };
  const radialPose: Pose = { dx: 0.3, dy: 0.45, dz: -0.15, rx: 10 * DEG, ry: 0, rz: -10 * DEG, pivot: [0, art, 0] };
  const ulnarPose: Pose = { dx: -0.1, dy: 0.2, dz: -0.3, rx: 22 * DEG, ry: 0, rz: 0, pivot: [0, art, 0] };
  return {
    id,
    pieces: [
      { id: "proximal", mesh: loft(RADIUS_SECTIONS, metTop, top, { cap0: "flat", rings: 28 }), displaced: IDENTITY_POSE },
      { id: "metafisis-volar", mesh: loft(RADIUS_SECTIONS, art, metTop, { ...notDorsal, rings: 5 }), displaced: IDENTITY_POSE },
      { id: "dorsal-1", mesh: loft(RADIUS_SECTIONS, art, 1.5, { ...dorsal, rings: 2 }), displaced: { dx: 0.15, dy: 0.25, dz: -0.5, rx: 35 * DEG, ry: 0, rz: 12 * DEG, pivot: [0, 1.25, -0.9] } },
      { id: "dorsal-2", mesh: loft(RADIUS_SECTIONS, 1.5, 1.95, { ...dorsal, rings: 2 }), displaced: { dx: -0.2, dy: 0.1, dz: -0.65, rx: 48 * DEG, ry: 0, rz: -14 * DEG, pivot: [0, 1.7, -0.9] } },
      { id: "dorsal-3", mesh: loft(RADIUS_SECTIONS, 1.95, metTop, { ...dorsal, rings: 2 }), displaced: { dx: 0.1, dy: 0.15, dz: -0.35, rx: 20 * DEG, ry: 0, rz: 8 * DEG, pivot: [0, 2.2, -0.9] } },
      {
        id: "articular-radial",
        mesh: mergeMeshData(loft(RADIUS_SECTIONS, 0, art, { ...radial, cap0: "dished", cap1: "flat", rings: 5 }), styloid),
        displaced: radialPose,
      },
      {
        id: "articular-cubital",
        mesh: mergeMeshData(loft(RADIUS_SECTIONS, 0, art, { ...ulnar, cap0: "dished", cap1: "flat", rings: 5 }), lister),
        displaced: ulnarPose,
      },
    ],
    hand: { dx: 0.1, dy: 0.4, dz: -0.2, rx: 14 * DEG, ry: 0, rz: -4 * DEG, pivot: [0, art, 0] },
  };
}

/** Pose interpolada entre reducida (t = 0) y desplazada (t = 1). */
export function lerpPose(p: Pose, t: number): Pose {
  return {
    dx: p.dx * t, dy: p.dy * t, dz: p.dz * t,
    rx: p.rx * t, ry: p.ry * t, rz: p.rz * t,
    pivot: p.pivot,
  };
}

// ---------- Implantes ----------

/** Placa volar: cuerpo en la diáfisis más cabeza ancha subcondral, con las posiciones de sus tornillos. */
export const PLATE = {
  /** Zona distal (cabeza): ancho x alto en la cortical volar. */
  headY: [0.9, 2.5] as [number, number],
  headHalfWidth: 1.15,
  shaftY: [2.5, 7.4] as [number, number],
  shaftHalfWidth: 0.42,
  thickness: 0.16,
  z: 0.98,
  /** Tornillos bloqueados distales (x, y) — hilera subcondral. */
  distalScrews: [[-0.85, 1.25], [-0.28, 1.2], [0.28, 1.2], [0.85, 1.25]] as [number, number][],
  distalScrewLength: 1.7,
  /** Tornillos corticales proximales (y). */
  proximalScrews: [3.6, 4.9, 6.2] as number[],
  proximalScrewLength: 1.15,
};

/** Agujas de Kirschner de 1,6 mm: entrada en estiloides radial, salida en la cortical cubital proximal. */
export const KWIRES: { from: [number, number, number]; to: [number, number, number] }[] = [
  { from: [1.35, -0.55, 0.15], to: [-0.45, 3.6, 0.05] },
  { from: [1.25, -0.75, -0.25], to: [-0.4, 3.0, -0.35] },
  { from: [-0.2, 0.15, -0.88], to: [0.5, 3.5, 0.3] },
];
export const KWIRE_RADIUS = 0.08;

/** Fijador externo puente: dos pines en el metacarpiano II, dos en la diáfisis radial y una barra. */
export const EXFIX = {
  barX: 2.55,
  barY: [-6.2, 9.0] as [number, number],
  handPins: [-5.0, -6.1] as number[],
  radiusPins: [6.8, 8.6] as number[],
  pinRadius: 0.13,
  barRadius: 0.17,
};

/** Mano esquemática: carpo y metacarpiano II. Coordenadas locales del radio. */
export function handBones() {
  return {
    scaphoid: ellipsoid(0.55, -1.55, 0.1, 0.85, 0.7, 0.55, 14),
    lunate: ellipsoid(-0.75, -1.3, 0.05, 0.62, 0.55, 0.55, 14),
    distalRow: ellipsoid(0, -2.85, 0.1, 1.55, 0.5, 0.7, 14),
    metacarpal: loft(
      [{ y: -9, rx: 0.3, rz: 0.3, cx: 0.55, cz: 0.1 }, { y: -4.2, rx: 0.33, rz: 0.33, cx: 0.55, cz: 0.1 }, { y: -3.4, rx: 0.5, rz: 0.45, cx: 0.55, cz: 0.1 }],
      -9, -3.4, { rings: 12, cap0: "flat" },
    ),
  };
}

// ---------- Placa volar: superficie que sigue la cortical ----------

/** Altura z de la cortical volar del radio en (x, y). */
export function cortexZ(x: number, y: number): number {
  const sec = interpolateSection(RADIUS_SECTIONS, y);
  const t = Math.min(1, Math.abs(x) / sec.rx);
  return sec.rz * Math.sqrt(1 - t * t);
}

/** Semiancho de la placa a la altura y: cabeza ancha, estrechamiento y cuerpo. */
export function plateHalfWidth(y: number): number {
  const neck = PLATE.headY[1];
  if (y <= neck - 0.3) return PLATE.headHalfWidth;
  if (y >= neck + 0.4) return PLATE.shaftHalfWidth;
  return lerp(PLATE.headHalfWidth, PLATE.shaftHalfWidth, smooth((y - (neck - 0.3)) / 0.7));
}

/** Cara superior de la placa en (x, y). */
export function plateTopZ(x: number, y: number): number {
  return cortexZ(x, y) + 0.03 + PLATE.thickness;
}

/** Malla de la placa, curvada sobre la cortical volar. */
export function plateMesh(): MeshData {
  const y0 = PLATE.headY[0];
  const y1 = PLATE.shaftY[1];
  const rows = Math.round((y1 - y0) / 0.1);
  const cols = 12;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i <= rows; i++) {
      const y = lerp(y0, y1, i / rows);
      const hw = plateHalfWidth(y);
      for (let j = 0; j <= cols; j++) {
        const x = -hw + (2 * hw * j) / cols;
        const bottom = cortexZ(x, y) + 0.03;
        positions.push(x, y, layer === 0 ? bottom + PLATE.thickness : bottom);
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
