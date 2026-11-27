// Escena 3D de la tibia (diáfisis) en el Atlas de osteosíntesis, sobre el motor común (osteo-engine.ts). Recibe el
// módulo `three` ya cargado (se importa de forma dinámica en el componente para que no pese en el resto de la aplicación).
import type * as T from "three";
import { lerpPose, type Pose } from "../lib/osteo-geometry.ts";
import {
  EXFIX, NAIL, PLATE,
  anteriorCortexZ, buildTibiaFracture, fibulaBody, fibulaZoneAt, lateralCortexX, lateralCortexXAt, medialCortexX,
  nailZ, plateMesh, posteriorCortexZ, tibiaZoneAt,
  type TibiaFractureId,
} from "../lib/osteo-tibia-geometry.ts";
import { COLORS, createStage, type Entry, type SceneFactory, type Vec3, type ViewDef } from "./osteo-engine.ts";

export type { SceneController } from "./osteo-engine.ts";

export const TIBIA_VIEWS: Record<string, ViewDef> = {
  anterior: { pos: [0, 9, 44], target: [0, 9, 0] },
  posterior: { pos: [0, 9, -44], target: [0, 9, 0] },
  medial: { pos: [44, 9, 0], target: [0, 9, 0] },
  lateral: { pos: [-44, 9, 0], target: [0, 9, 0] },
  rodilla: { pos: [9, 25, 18], target: [0, 16.5, 0.5] },
  tobillo: { pos: [12, 3, 18], target: [0, 1, 0] },
};

export const createScene: SceneFactory = (THREE, OrbitControls, container, callbacks) => {
  const stage = createStage(THREE, OrbitControls, container, {
    views: TIBIA_VIEWS,
    first: "anterior",
    distance: { min: 8, max: 90 },
    onSelect: callbacks.onSelect,
  });
  const { scene, boneMat, steelMat, toGeometry, addEntry, removeEntry, request, cylinderBetween } = stage;
  const cyl = (a: Vec3, b: Vec3, r: number, zone: string, base: Vec3, parent: T.Object3D) => { cylinderBetween(a, b, r, zone, base, parent); };

  const root = new THREE.Group();
  scene.add(root);

  // El peroné no cambia con la fractura (se dibuja íntegro para ver mejor la tibia).
  addEntry(new THREE.Mesh(toGeometry(fibulaBody()), boneMat), (x, y) => fibulaZoneAt(x, y), COLORS.boneDark, root);

  // ---------- tibia, según la fractura ----------
  type Fragment = { pivot: T.Group; entry: Entry; pose: Pose };
  let fragments: Fragment[] = [];
  const clearFragments = () => {
    for (const f of fragments) {
      removeEntry(f.entry);
      f.pivot.parent?.remove(f.pivot);
    }
    fragments = [];
  };

  let fractureId: TibiaFractureId = "none";
  const buildTibia = (id: TibiaFractureId) => {
    clearFragments();
    fractureId = id;
    for (const piece of buildTibiaFracture(id).pieces) {
      const pivot = new THREE.Group();
      const mesh = new THREE.Mesh(toGeometry(piece.mesh), boneMat);
      mesh.position.set(-piece.displaced.pivot[0], -piece.displaced.pivot[1], -piece.displaced.pivot[2]);
      pivot.add(mesh);
      root.add(pivot);
      const entry = addEntry(mesh, (x, y, z) => tibiaZoneAt(x, y, z), COLORS.bone, pivot);
      fragments.push({ pivot, entry, pose: piece.displaced });
    }
    applyPoses();
    request();
  };

  // Valor 1 = fractura desplazada; 0 = reducida. Sin fractura (estado inicial) el hueso está en su sitio.
  let t = 0;
  let targetT = 0;
  const applyPoses = () => {
    for (const f of fragments) {
      const p = lerpPose(f.pose, t);
      f.pivot.position.set(f.pose.pivot[0] + p.dx, f.pose.pivot[1] + p.dy, f.pose.pivot[2] + p.dz);
      f.pivot.rotation.set(p.rx, p.ry, p.rz);
    }
    syncImplantVisibility();
  };

  // ---------- implantes ----------
  const implants: Record<string, T.Group> = { nail: new THREE.Group(), plate: new THREE.Group(), exfix: new THREE.Group() };
  for (const g of Object.values(implants)) { g.visible = false; root.add(g); }
  let wanted = new Set<string>();
  const syncImplantVisibility = () => {
    let any = false;
    for (const id of Object.keys(implants)) {
      implants[id].visible = wanted.has(id) && t < 0.01;
      any = any || implants[id].visible;
    }
    // Con implantes a la vista el hueso se vuelve semitransparente para ver el clavo y los tornillos por dentro.
    if (boneMat.transparent !== any) {
      boneMat.transparent = any;
      boneMat.opacity = any ? 0.5 : 1;
      boneMat.depthWrite = !any;
      boneMat.needsUpdate = true;
    }
  };

  // Clavo endomedular y sus tornillos de bloqueo.
  {
    const [a, b, c] = NAIL.path;
    cyl(a, b, NAIL.radius, "nail", COLORS.steel, implants.nail);
    cyl(b, c, NAIL.radius, "nail", COLORS.steel, implants.nail);
    const lock = (y: number, axis: "x" | "z", zone: string) => {
      const zc = nailZ(y);
      if (axis === "x") {
        const m = medialCortexX(y) + 0.2, l = lateralCortexX(y) - 0.18;
        cyl([m, y, zc], [l, y, zc], NAIL.screwRadius, zone, COLORS.dark, implants.nail);
        cyl([m + 0.04, y, zc], [m - 0.18, y, zc], NAIL.screwRadius * 1.7, zone, COLORS.dark, implants.nail);
      } else {
        const f = anteriorCortexZ(y) + 0.2, p = posteriorCortexZ(y) - 0.18;
        cyl([0, y, f], [0, y, p], NAIL.screwRadius, zone, COLORS.dark, implants.nail);
        cyl([0, y, f + 0.04], [0, y, f - 0.18], NAIL.screwRadius * 1.7, zone, COLORS.dark, implants.nail);
      }
    };
    for (const l of NAIL.proximalLocks) lock(l.y, l.axis, "lock-prox");
    for (const l of NAIL.distalLocks) lock(l.y, l.axis, "lock-dist");
  }

  // Placa medial en puente con sus tornillos.
  {
    addEntry(new THREE.Mesh(toGeometry(plateMesh()), steelMat), "plate", COLORS.steel, implants.plate);
    for (const y of PLATE.screws) {
      const top = medialCortexX(y) + 0.02 + PLATE.thickness;
      const end = lateralCortexX(y) - 0.18;
      cyl([top + 0.04, y, 0], [end, y, 0], PLATE.screwRadius, "plate-screw", COLORS.dark, implants.plate);
      cyl([top + 0.1, y, 0], [top, y, 0], PLATE.screwRadius * 1.8, "plate-screw", COLORS.dark, implants.plate);
    }
  }

  // Fijador externo uniplanar.
  {
    const x = EXFIX.barX, z = EXFIX.barZ;
    cyl([x, EXFIX.barY[0], z], [x, EXFIX.barY[1], z], EXFIX.barRadius, "exfix-bar", COLORS.steel, implants.exfix);
    for (const y of EXFIX.pins) cyl([x, y, z], [lateralCortexXAt(y, z) - 0.2, y, z], EXFIX.pinRadius, "exfix-pin", COLORS.dark, implants.exfix);
  }

  stage.addTicker(() => {
    if (Math.abs(t - targetT) <= 0.001) return false;
    t += (targetT - t) * 0.14;
    if (Math.abs(t - targetT) <= 0.001) t = targetT;
    applyPoses();
    return true;
  });

  buildTibia("none");
  t = 0; targetT = 0;
  applyPoses();

  return {
    setFracture(id) {
      if (id === fractureId) return;
      buildTibia(id as TibiaFractureId);
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
