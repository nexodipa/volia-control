// Escena 3D del Atlas de osteosíntesis. Recibe el módulo `three` ya cargado (se importa de forma dinámica en el
// componente para que no pese en el resto de la aplicación).
import type * as T from "three";
import type { OrbitControls as OrbitControlsType } from "three/examples/jsm/controls/OrbitControls.js";
import {
  EXFIX, KWIRES, KWIRE_RADIUS, PLATE, RADIUS_CENTER_X, RADIUS_SECTIONS, ULNA_CENTER_X,
  buildFracture, handBones, interpolateSection, lerpPose, plateMesh, plateTopZ, radiusZoneAt,
  ulnaBody, ulnaStyloid,
  type FractureId, type MeshData, type Pose,
} from "../lib/osteo-geometry.ts";
import type { ImplantId, ZoneId } from "../lib/osteo-atlas.ts";

type Three = typeof T;
type ZoneRule = ZoneId | ((x: number, y: number, z: number) => ZoneId);

export type ViewName = "volar" | "dorsal" | "radial" | "articular";

export type SceneController = {
  setFracture(id: FractureId): void;
  setReduced(reduced: boolean): void;
  setImplants(on: Set<ImplantId>): void;
  setSelected(zone: ZoneId | null): void;
  setView(view: ViewName): void;
  dispose(): void;
};

export type SceneCallbacks = { onSelect(zone: ZoneId | null): void };

const COLORS = {
  background: 0x15191b,
  bone: [0.91, 0.87, 0.79] as [number, number, number],
  carpus: [0.8, 0.74, 0.62] as [number, number, number],
  steel: [0.66, 0.71, 0.76] as [number, number, number],
  wire: [0.86, 0.88, 0.9] as [number, number, number],
  dark: [0.42, 0.47, 0.52] as [number, number, number],
  selected: [0.86, 0.14, 0.2] as [number, number, number],
};

const VIEWS: Record<ViewName, { pos: [number, number, number]; target: [number, number, number] }> = {
  volar: { pos: [0.4, 1, 31], target: [0.4, 1, 0] },
  dorsal: { pos: [0.4, 1, -31], target: [0.4, 1, 0] },
  radial: { pos: [31, 1, 0], target: [0.4, 1, 0] },
  articular: { pos: [1.2, -22, 9], target: [0.9, 0, 0] },
};

export function createScene(
  THREE: Three,
  OrbitControls: typeof OrbitControlsType,
  container: HTMLElement,
  callbacks: SceneCallbacks,
): SceneController {
  const width = () => Math.max(container.clientWidth, 200);
  const height = () => Math.max(container.clientHeight, 200);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width(), height());
  renderer.setClearColor(COLORS.background, 1);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "none";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, width() / height(), 0.1, 200);
  camera.position.set(...VIEWS.volar.pos);
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2b3033, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(3, 5, 8);
  camera.add(key);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.target.set(...VIEWS.volar.target);
  controls.minDistance = 8;
  controls.maxDistance = 70;
  controls.enablePan = false;
  controls.update();

  // ---------- registro de piezas seleccionables ----------
  type Entry = { mesh: T.Mesh; rule: ZoneRule; base: [number, number, number] };
  const entries: Entry[] = [];
  const owned: { dispose(): void }[] = [];
  let selected: ZoneId | null = null;
  let dirty = true;
  const request = () => { dirty = true; };

  const toGeometry = (m: MeshData) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(m.positions, 3));
    g.setIndex(m.indices);
    g.computeVertexNormals();
    g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(m.positions.length).fill(1), 3));
    owned.push(g);
    return g;
  };
  const material = (rough = 0.7, metal = 0) => {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal, side: THREE.DoubleSide });
    owned.push(mat);
    return mat;
  };
  const boneMat = material(0.78, 0);
  const steelMat = material(0.35, 0.65);

  const paint = (e: Entry) => {
    const g = e.mesh.geometry;
    const pos = g.getAttribute("position");
    const col = g.getAttribute("color");
    for (let i = 0; i < pos.count; i++) {
      const zone = typeof e.rule === "function" ? e.rule(pos.getX(i), pos.getY(i), pos.getZ(i)) : e.rule;
      const c = zone === selected ? COLORS.selected : e.base;
      col.setXYZ(i, c[0], c[1], c[2]);
    }
    col.needsUpdate = true;
  };
  const addEntry = (mesh: T.Mesh, rule: ZoneRule, base: [number, number, number], parent: T.Object3D) => {
    const e = { mesh, rule, base };
    entries.push(e);
    paint(e);
    parent.add(mesh);
    return e;
  };
  const repaintAll = () => { entries.forEach(paint); request(); };

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
  addEntry(new THREE.Mesh(toGeometry(hand.scaphoid), boneMat), "carpus", COLORS.carpus, handInner);
  addEntry(new THREE.Mesh(toGeometry(hand.lunate), boneMat), "carpus", COLORS.carpus, handInner);
  addEntry(new THREE.Mesh(toGeometry(hand.distalRow), boneMat), "carpus", COLORS.carpus, handInner);
  addEntry(new THREE.Mesh(toGeometry(hand.metacarpal), boneMat), "metacarpal", COLORS.carpus, handInner);

  // ---------- radio, según la fractura ----------
  type Fragment = { pivot: T.Group; entry: Entry; pose: Pose };
  let fragments: Fragment[] = [];
  let handPose: Pose = { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0, pivot: [0, 0, 0] };
  const radiusRule = (x: number, y: number, z: number): ZoneId => radiusZoneAt(x, y, z);

  const clearFragments = () => {
    for (const f of fragments) {
      const i = entries.indexOf(f.entry);
      if (i >= 0) entries.splice(i, 1);
      f.pivot.parent?.remove(f.pivot);
      f.entry.mesh.geometry.dispose();
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
  const implants: Record<ImplantId, T.Group> = { plate: new THREE.Group(), kwires: new THREE.Group(), exfix: new THREE.Group() };
  for (const g of Object.values(implants)) { g.visible = false; radiusRoot.add(g); }
  let wanted = new Set<ImplantId>();
  const syncImplantVisibility = () => {
    let any = false;
    for (const id of Object.keys(implants) as ImplantId[]) {
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

  const cylinderBetween = (a: [number, number, number], b: [number, number, number], radius: number, zone: ZoneId, base: [number, number, number], parent: T.Object3D) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(radius, radius, len, 14);
    owned.push(geo);
    geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(geo.getAttribute("position").count * 3).fill(1), 3));
    const mesh = new THREE.Mesh(geo, steelMat);
    mesh.position.copy(va.clone().add(vb).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    addEntry(mesh, zone, base, parent);
  };

  // Placa volar con sus tornillos.
  {
    const mesh = new THREE.Mesh(toGeometry(plateMesh()), steelMat);
    addEntry(mesh, "plate", COLORS.steel, implants.plate);
    for (const [x, y] of PLATE.distalScrews) {
      const top = plateTopZ(x, y);
      cylinderBetween([x, y, top + 0.06], [x, y, top - PLATE.distalScrewLength], 0.1, "screw-distal", COLORS.dark, implants.plate);
      cylinderBetween([x, y, top + 0.08], [x, y, top], 0.17, "screw-distal", COLORS.dark, implants.plate);
    }
    for (const y of PLATE.proximalScrews) {
      const top = plateTopZ(0, y);
      const sec = interpolateSection(RADIUS_SECTIONS, y);
      const len = sec.rz * 2 + 0.35;
      cylinderBetween([0, y, top + 0.06], [0, y, top - len], 0.12, "screw-prox", COLORS.dark, implants.plate);
      cylinderBetween([0, y, top + 0.08], [0, y, top], 0.19, "screw-prox", COLORS.dark, implants.plate);
    }
  }
  // Agujas de Kirschner.
  for (const w of KWIRES) cylinderBetween(w.from, w.to, KWIRE_RADIUS, "kwire", COLORS.wire, implants.kwires);
  // Fijador externo puente.
  {
    const x = EXFIX.barX;
    cylinderBetween([x, EXFIX.barY[0], 0.2], [x, EXFIX.barY[1], 0.2], EXFIX.barRadius, "exfix-bar", COLORS.steel, implants.exfix);
    for (const y of EXFIX.radiusPins) {
      cylinderBetween([x, y, 0.2], [-0.95, y, 0.1], EXFIX.pinRadius, "exfix-pin", COLORS.dark, implants.exfix);
    }
    for (const y of EXFIX.handPins) {
      cylinderBetween([x, y, 0.2], [-0.2, y, 0.1], EXFIX.pinRadius, "exfix-pin", COLORS.dark, implants.exfix);
    }
  }

  // ---------- interacción ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down: { x: number; y: number } | null = null;

  const visibleChain = (o: T.Object3D | null) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

  const pick = (clientX: number, clientY: number): ZoneId | null => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(entries.map((e) => e.mesh).filter((m) => visibleChain(m)), false);
    if (!hits.length) return null;
    const hit = hits[0];
    const entry = entries.find((e) => e.mesh === hit.object);
    if (!entry) return null;
    if (typeof entry.rule !== "function") return entry.rule;
    const local = entry.mesh.worldToLocal(hit.point.clone());
    return entry.rule(local.x, local.y, local.z);
  };

  const onDown = (ev: PointerEvent) => { down = { x: ev.clientX, y: ev.clientY }; };
  const onUp = (ev: PointerEvent) => {
    if (!down) return;
    const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y);
    down = null;
    if (moved > 5) return;
    const zone = pick(ev.clientX, ev.clientY);
    callbacks.onSelect(zone);
  };
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  controls.addEventListener("change", request);

  // ---------- vistas con transición ----------
  let tween: { from: T.Vector3; to: T.Vector3; fromT: T.Vector3; toT: T.Vector3; k: number } | null = null;
  let articularView = false;
  const setView = (view: ViewName) => {
    const v = VIEWS[view];
    tween = {
      from: camera.position.clone(), to: new THREE.Vector3(...v.pos),
      fromT: controls.target.clone(), toT: new THREE.Vector3(...v.target), k: 0,
    };
    articularView = view === "articular";
    handPivot.visible = !articularView;
    for (const e of entries) {
      // En la vista articular se oculta también la barra y los pines que taparían la superficie.
      if (e.rule === "exfix-bar" || e.rule === "exfix-pin") e.mesh.visible = !articularView;
    }
    request();
  };

  // ---------- bucle ----------
  let raf = 0;
  let disposed = false;
  const loop = () => {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    if (Math.abs(t - targetT) > 0.001) {
      t += (targetT - t) * 0.14;
      if (Math.abs(t - targetT) <= 0.001) t = targetT;
      applyPoses();
      request();
    }
    if (tween) {
      tween.k = Math.min(1, tween.k + 0.06);
      const e = (1 - Math.cos(Math.PI * tween.k)) / 2;
      camera.position.lerpVectors(tween.from, tween.to, e);
      controls.target.lerpVectors(tween.fromT, tween.toT, e);
      if (tween.k >= 1) tween = null;
      request();
    }
    const moving = controls.update();
    if (dirty || moving) {
      renderer.render(scene, camera);
      dirty = false;
    }
  };
  loop();

  const resize = () => {
    renderer.setSize(width(), height());
    camera.aspect = width() / height();
    camera.updateProjectionMatrix();
    request();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  buildRadius("none");
  t = 0; targetT = 0;
  applyPoses();

  return {
    setFracture(id) {
      if (id === fractureId) return;
      buildRadius(id);
      t = id === "none" ? 0 : 1;
      targetT = t;
      applyPoses();
      repaintAll();
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
    setSelected(zone) {
      selected = zone;
      repaintAll();
    },
    setView,
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      controls.dispose();
      owned.forEach((o) => o.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
