// Escena 3D del radio distal en el Atlas de osteosíntesis, sobre el motor común (osteo-engine.ts). Recibe el módulo
// `three` ya cargado (se importa de forma dinámica en el componente para que no pese en el resto de la aplicación).
import type * as T from "three";
import {
  EXFIX, KWIRES, KWIRE_RADIUS, PLATE, RADIUS_CENTER_X, RADIUS_SECTIONS, ULNA_CENTER_X,
  buildFracture, handBones, interpolateSection, lerpPose, plateMesh, plateTopZ, radiusZoneAt,
  ulnaBody, ulnaStyloid,
  type FractureId, type Pose,
} from "../lib/osteo-geometry.ts";
import { COLORS, createStage, type Entry, type SceneFactory, type ViewDef } from "./osteo-engine.ts";

export type { SceneController } from "./osteo-engine.ts";
export type ViewName = "volar" | "dorsal" | "radial" | "articular";

export const RADIUS_VIEWS: Record<ViewName, ViewDef> = {
  volar: { pos: [0.4, 1, 31], target: [0.4, 1, 0] },
  dorsal: { pos: [0.4, 1, -31], target: [0.4, 1, 0] },
  radial: { pos: [31, 1, 0], target: [0.4, 1, 0] },
  articular: { pos: [1.2, -22, 9], target: [0.9, 0, 0] },
};

export const createScene: SceneFactory = (THREE, OrbitControls, container, callbacks) => {
  const stage = createStage(THREE, OrbitControls, container, {
    views: RADIUS_VIEWS,
    first: "volar",
    onSelect: callbacks.onSelect,
    onView: (view) => {
      const articularView = view === "articular";
      handPivot.visible = !articularView;
      // En la vista articular se oculta también la barra y los pines que taparían la superficie.
      for (const e of stage.entries) if (e.rule === "exfix-bar" || e.rule === "exfix-pin") e.mesh.visible = !articularView;
    },
  });
  const { scene, boneMat, steelMat, toGeometry, addEntry, removeEntry, request, cylinderBetween } = stage;
  const cyl = (a: [number, number, number], b: [number, number, number], r: number, zone: string, base: [number, number, number], parent: T.Object3D) => { cylinderBetween(a, b, r, zone, base, parent); };

  // ---------- esqueleto ----------
  const radiusRoot = new THREE.Group();
  radiusRoot.position.x = RADIUS_CENTER_X;
  scene.add(radiusRoot);
  const ulnaRoot = new THREE.Group();
  ulnaRoot.position.x = ULNA_CENTER_X;
  scene.add(ulnaRoot);

  addEntry(new THREE.Mesh(toGeometry(ulnaBody()), boneMat), "ulna-head", COLORS.bone, ulnaRoot);
  addEntry(new THREE.Mesh(toGeometry(ulnaStyloid()), boneMat), "ulna-styloid", COLORS.bone, ulnaRoot);

  // Mano (carpo y metacarpiano) con su propio pivote para acompañar a la fractura.
  const handPivot = new THREE.Group();
  const handInner = new THREE.Group();
  handPivot.add(handInner);
  radiusRoot.add(handPivot);
  const hand = handBones();
  addEntry(new THREE.Mesh(toGeometry(hand.scaphoid), boneMat), "carpus", COLORS.boneDark, handInner);
  addEntry(new THREE.Mesh(toGeometry(hand.lunate), boneMat), "carpus", COLORS.boneDark, handInner);
  addEntry(new THREE.Mesh(toGeometry(hand.distalRow), boneMat), "carpus", COLORS.boneDark, handInner);
  addEntry(new THREE.Mesh(toGeometry(hand.metacarpal), boneMat), "metacarpal", COLORS.boneDark, handInner);

  // ---------- radio, según la fractura ----------
  type Fragment = { pivot: T.Group; entry: Entry; pose: Pose };
  let fragments: Fragment[] = [];
  let handPose: Pose = { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0, pivot: [0, 0, 0] };
  const radiusRule = (x: number, y: number, z: number): string => radiusZoneAt(x, y, z);

  const clearFragments = () => {
    for (const f of fragments) {
      removeEntry(f.entry);
      f.pivot.parent?.remove(f.pivot);
    }
    fragments = [];
  };

  let fractureId: FractureId = "none";
  const buildRadius = (id: FractureId) => {
    clearFragments();
    fractureId = id;
    const model = buildFracture(id);
    for (const piece of model.pieces) {
      const pivot = new THREE.Group();
      const mesh = new THREE.Mesh(toGeometry(piece.mesh), boneMat);
      mesh.position.set(-piece.displaced.pivot[0], -piece.displaced.pivot[1], -piece.displaced.pivot[2]);
      pivot.add(mesh);
      radiusRoot.add(pivot);
      const entry = addEntry(mesh, radiusRule, COLORS.bone, pivot);
      fragments.push({ pivot, entry, pose: piece.displaced });
    }
    handPose = model.hand;
    handInner.position.set(-handPose.pivot[0], -handPose.pivot[1], -handPose.pivot[2]);
    applyPoses();
    request();
  };

  // Valor 1 = fractura desplazada; 0 = reducida. Sin fractura (estado inicial) el hueso está en su sitio.
  let t = 0;
  let targetT = 0;
  const place = (group: T.Object3D, pose: Pose) => {
    const p = lerpPose(pose, t);
    group.position.set(pose.pivot[0] + p.dx, pose.pivot[1] + p.dy, pose.pivot[2] + p.dz);
    group.rotation.set(p.rx, p.ry, p.rz);
  };
  const applyPoses = () => {
    for (const f of fragments) place(f.pivot, f.pose);
    place(handPivot, handPose);
    syncImplantVisibility();
  };

  // ---------- implantes ----------
  const implants: Record<string, T.Group> = { plate: new THREE.Group(), kwires: new THREE.Group(), exfix: new THREE.Group() };
  for (const g of Object.values(implants)) { g.visible = false; radiusRoot.add(g); }
  let wanted = new Set<string>();
  const syncImplantVisibility = () => {
    let any = false;
    for (const id of Object.keys(implants)) {
      implants[id].visible = wanted.has(id) && t < 0.01;
      any = any || implants[id].visible;
    }
    // Con implantes a la vista el hueso se vuelve semitransparente para ver agujas y tornillos por dentro.
    if (boneMat.transparent !== any) {
      boneMat.transparent = any;
      boneMat.opacity = any ? 0.55 : 1;
      boneMat.depthWrite = !any;
      boneMat.needsUpdate = true;
    }
  };

  // Placa volar con sus tornillos.
  {
    const mesh = new THREE.Mesh(toGeometry(plateMesh()), steelMat);
    addEntry(mesh, "plate", COLORS.steel, implants.plate);
    for (const [x, y] of PLATE.distalScrews) {
      const top = plateTopZ(x, y);
      cyl([x, y, top + 0.06], [x, y, top - PLATE.distalScrewLength], 0.1, "screw-distal", COLORS.dark, implants.plate);
      cyl([x, y, top + 0.08], [x, y, top], 0.17, "screw-distal", COLORS.dark, implants.plate);
    }
    for (const y of PLATE.proximalScrews) {
      const top = plateTopZ(0, y);
      const sec = interpolateSection(RADIUS_SECTIONS, y);
      const len = sec.rz * 2 + 0.35;
      cyl([0, y, top + 0.06], [0, y, top - len], 0.12, "screw-prox", COLORS.dark, implants.plate);
      cyl([0, y, top + 0.08], [0, y, top], 0.19, "screw-prox", COLORS.dark, implants.plate);
    }
  }
  // Agujas de Kirschner.
  for (const w of KWIRES) cyl(w.from, w.to, KWIRE_RADIUS, "kwire", COLORS.wire, implants.kwires);
  // Fijador externo puente.
  {
    const x = EXFIX.barX;
    cyl([x, EXFIX.barY[0], 0.2], [x, EXFIX.barY[1], 0.2], EXFIX.barRadius, "exfix-bar", COLORS.steel, implants.exfix);
    for (const y of EXFIX.radiusPins) cyl([x, y, 0.2], [-0.95, y, 0.1], EXFIX.pinRadius, "exfix-pin", COLORS.dark, implants.exfix);
    for (const y of EXFIX.handPins) cyl([x, y, 0.2], [-0.2, y, 0.1], EXFIX.pinRadius, "exfix-pin", COLORS.dark, implants.exfix);
  }

  stage.addTicker(() => {
    if (Math.abs(t - targetT) <= 0.001) return false;
    t += (targetT - t) * 0.14;
    if (Math.abs(t - targetT) <= 0.001) t = targetT;
    applyPoses();
    return true;
  });

  buildRadius("none");
  t = 0; targetT = 0;
  applyPoses();

  return {
    setFracture(id) {
      if (id === fractureId) return;
      buildRadius(id as FractureId);
      t = id === "none" ? 0 : 1;
      targetT = t;
      applyPoses();
      stage.repaintAll();
    },
    setReduced(reduced) {
      targetT = reduced ? 0 : 1;
      request();
    },
    setImplants(on) {
      wanted = new Set(on);
      syncImplantVisibility();
      request();
    },
    setSelected: stage.setSelected,
    setView: stage.setView,
    dispose: stage.dispose,
  };
};
