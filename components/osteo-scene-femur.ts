// Escena 3D del fémur proximal (región trocantérica) en el Atlas de osteosíntesis, sobre el motor común (osteo-engine.ts).
// Recibe el módulo `three` ya cargado (se importa de forma dinámica en el componente).
import type * as T from "three";
import { lerpPose, type Pose } from "../lib/osteo-geometry.ts";
import {
  NAIL, NECK, PLATE,
  buildFemurFracture, femurZoneAt, headScrewEnds, lateralCortexX, medialCortexX, neckPoint, plateMesh,
  plateOuterX, type FemurFractureId,
} from "../lib/osteo-femur-geometry.ts";
import { COLORS, createStage, type Entry, type SceneFactory, type Vec3, type ViewDef } from "./osteo-engine.ts";

export type { SceneController } from "./osteo-engine.ts";

const HC = NECK.headCenter;

export const FEMUR_VIEWS: Record<string, ViewDef> = {
  anterior: { pos: [1.9, 4.6, 36], target: [1.9, 4.6, 0] },
  posterior: { pos: [1.9, 4.6, -36], target: [1.9, 4.6, 0] },
  medial: { pos: [40, 4.6, 0], target: [1.9, 4.6, 0] },
  lateral: { pos: [-36, 4.6, 0], target: [1.9, 4.6, 0] },
  trocanter: { pos: [-13, 14, 15], target: [-0.2, 8, 0] },
  cabeza: { pos: [HC[0] + 11, HC[1] + 7, HC[2] + 14], target: [HC[0], HC[1] - 0.6, HC[2]] },
};

export const createScene: SceneFactory = (THREE, OrbitControls, container, callbacks) => {
  const stage = createStage(THREE, OrbitControls, container, {
    views: FEMUR_VIEWS,
    first: "anterior",
    distance: { min: 6, max: 80 },
    onSelect: callbacks.onSelect,
  });
  const { scene, boneMat, steelMat, toGeometry, addEntry, removeEntry, request, cylinderBetween } = stage;
  const cyl = (a: Vec3, b: Vec3, r: number, zone: string, base: Vec3, parent: T.Object3D) => { cylinderBetween(a, b, r, zone, base, parent); };

  const root = new THREE.Group();
  scene.add(root);

  // ---------- fémur, según la fractura ----------
  type Fragment = { pivot: T.Group; entry: Entry; pose: Pose };
  let fragments: Fragment[] = [];
  const clearFragments = () => {
    for (const f of fragments) {
      removeEntry(f.entry);
      f.pivot.parent?.remove(f.pivot);
    }
    fragments = [];
  };

  let fractureId: FemurFractureId = "none";
  const buildFemur = (id: FemurFractureId) => {
    clearFragments();
    fractureId = id;
    for (const piece of buildFemurFracture(id).pieces) {
      const pivot = new THREE.Group();
      const mesh = new THREE.Mesh(toGeometry(piece.mesh), boneMat);
      mesh.position.set(-piece.displaced.pivot[0], -piece.displaced.pivot[1], -piece.displaced.pivot[2]);
      pivot.add(mesh);
      root.add(pivot);
      const entry = addEntry(mesh, (x, y, z) => femurZoneAt(x, y, z), COLORS.bone, pivot);
      fragments.push({ pivot, entry, pose: piece.displaced });
    }
    applyPoses();
    request();
  };

  // Valor 1 = fractura desplazada; 0 = reducida. Sin fractura el hueso está en su sitio.
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
  const implants: Record<string, T.Group> = { nail: new THREE.Group(), plate: new THREE.Group() };
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

  // Clavo cefalomedular, tornillo cefálico y bloqueo distal.
  {
    const [a, b, c] = NAIL.path;
    cyl(a, b, NAIL.radius, "nail", COLORS.steel, implants.nail);
    cyl(b, c, NAIL.radius, "nail", COLORS.steel, implants.nail);
    const ls = NAIL.lagScrew;
    cyl(neckPoint(ls.tStart), neckPoint(ls.tEnd), ls.radius, "lag-screw", COLORS.dark, implants.nail);
    cyl(neckPoint(ls.tStart), neckPoint(ls.tStart + 0.3), ls.headRadius, "lag-screw", COLORS.dark, implants.nail);
    const y = NAIL.distalLock.y;
    const m = medialCortexX(y) + 0.2, l = lateralCortexX(y) - 0.18;
    cyl([m, y, 0], [l, y, 0], NAIL.distalLock.radius, "lock-dist", COLORS.dark, implants.nail);
    cyl([m + 0.04, y, 0], [m - 0.18, y, 0], NAIL.distalLock.radius * 1.7, "lock-dist", COLORS.dark, implants.nail);
  }

  // Placa lateral bloqueada con tres tornillos hacia la cabeza y cuatro en la diáfisis.
  {
    addEntry(new THREE.Mesh(toGeometry(plateMesh()), steelMat), "plate", COLORS.steel, implants.plate);
    for (const y of PLATE.headScrews) {
      const e = headScrewEnds(y);
      cyl(e.from, e.to, PLATE.headScrewRadius, "plate-head-screw", COLORS.dark, implants.plate);
    }
    for (const y of PLATE.shaftScrews) {
      const top = plateOuterX(y);
      const end = medialCortexX(y) - 0.15;
      cyl([top - 0.04, y, 0], [end, y, 0], PLATE.shaftScrewRadius, "plate-shaft-screw", COLORS.dark, implants.plate);
      cyl([top - 0.1, y, 0], [top, y, 0], PLATE.shaftScrewRadius * 1.8, "plate-shaft-screw", COLORS.dark, implants.plate);
    }
  }

  stage.addTicker(() => {
    if (Math.abs(t - targetT) <= 0.001) return false;
    t += (targetT - t) * 0.14;
    if (Math.abs(t - targetT) <= 0.001) t = targetT;
    applyPoses();
    return true;
  });

  buildFemur("none");
  t = 0; targetT = 0;
  applyPoses();

  return {
    setFracture(id) {
      if (id === fractureId) return;
      buildFemur(id as FemurFractureId);
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
