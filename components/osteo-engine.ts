// Motor 3D común de las regiones del Atlas de osteosíntesis: renderizador, cámara, selección por toque, pintura de
// la zona elegida, vistas con transición y bucle de dibujo. Cada región (radio, tibia...) arma su esqueleto,
// sus fracturas y sus implantes encima de este motor. Recibe el módulo `three` ya cargado.
import type * as T from "three";
import type { OrbitControls as OrbitControlsType } from "three/examples/jsm/controls/OrbitControls.js";
import type { MeshData } from "../lib/osteo-geometry.ts";

export type Three = typeof T;
export type Vec3 = [number, number, number];
export type ViewDef = { pos: Vec3; target: Vec3 };
export type ZoneRule = string | ((x: number, y: number, z: number) => string);
export type Entry = { mesh: T.Mesh; rule: ZoneRule; base: Vec3 };

export const COLORS = {
  background: 0x15191b,
  bone: [0.91, 0.87, 0.79] as Vec3,
  boneDark: [0.8, 0.74, 0.62] as Vec3,
  steel: [0.66, 0.71, 0.76] as Vec3,
  wire: [0.86, 0.88, 0.9] as Vec3,
  dark: [0.42, 0.47, 0.52] as Vec3,
  selected: [0.86, 0.14, 0.2] as Vec3,
};

export type StageOptions = {
  views: Record<string, ViewDef>;
  first: string;
  distance?: { min: number; max: number };
  onSelect(zone: string | null): void;
  /** Se llama al cambiar de vista, para que la región oculte lo que tapa. */
  onView?(view: string): void;
};

export function createStage(THREE: Three, OrbitControls: typeof OrbitControlsType, container: HTMLElement, opts: StageOptions) {
  const width = () => Math.max(container.clientWidth, 200);
  const height = () => Math.max(container.clientHeight, 200);
  const first = opts.views[opts.first];

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width(), height());
  renderer.setClearColor(COLORS.background, 1);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "none";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, width() / height(), 0.1, 300);
  camera.position.set(...first.pos);
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2b3033, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(3, 5, 8);
  camera.add(key);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.target.set(...first.target);
  controls.minDistance = opts.distance?.min ?? 8;
  controls.maxDistance = opts.distance?.max ?? 70;
  controls.enablePan = false;
  controls.update();

  const entries: Entry[] = [];
  const owned: { dispose(): void }[] = [];
  const tickers: (() => boolean)[] = [];
  let selected: string | null = null;
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
  const addEntry = (mesh: T.Mesh, rule: ZoneRule, base: Vec3, parent: T.Object3D) => {
    const e: Entry = { mesh, rule, base };
    entries.push(e);
    paint(e);
    parent.add(mesh);
    return e;
  };
  const removeEntry = (e: Entry) => {
    const i = entries.indexOf(e);
    if (i >= 0) entries.splice(i, 1);
    e.mesh.geometry.dispose();
  };
  const repaintAll = () => { entries.forEach(paint); request(); };

  const cylinderBetween = (a: Vec3, b: Vec3, radius: number, zone: string, base: Vec3, parent: T.Object3D) => {
    const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(radius, radius, len, 14);
    owned.push(geo);
    geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(geo.getAttribute("position").count * 3).fill(1), 3));
    const mesh = new THREE.Mesh(geo, steelMat);
    mesh.position.copy(va.clone().add(vb).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return addEntry(mesh, zone, base, parent);
  };

  // ---------- selección por toque ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down: { x: number; y: number } | null = null;
  const visibleChain = (o: T.Object3D | null) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

  const pick = (clientX: number, clientY: number): string | null => {
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
    opts.onSelect(pick(ev.clientX, ev.clientY));
  };
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  controls.addEventListener("change", request);

  // ---------- vistas con transición ----------
  let tween: { from: T.Vector3; to: T.Vector3; fromT: T.Vector3; toT: T.Vector3; k: number } | null = null;
  const setView = (view: string) => {
    const v = opts.views[view];
    if (!v) return;
    tween = {
      from: camera.position.clone(), to: new THREE.Vector3(...v.pos),
      fromT: controls.target.clone(), toT: new THREE.Vector3(...v.target), k: 0,
    };
    opts.onView?.(view);
    request();
  };

  // ---------- bucle ----------
  let raf = 0;
  let disposed = false;
  const loop = () => {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    for (const tick of tickers) if (tick()) request();
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

  const observer = new ResizeObserver(() => {
    renderer.setSize(width(), height());
    camera.aspect = width() / height();
    camera.updateProjectionMatrix();
    request();
  });
  observer.observe(container);

  return {
    scene, entries, boneMat, steelMat,
    toGeometry, material, addEntry, removeEntry, repaintAll, request, cylinderBetween, setView,
    /** Registra una función que se llama en cada cuadro; si devuelve true se vuelve a dibujar. */
    addTicker(fn: () => boolean) { tickers.push(fn); },
    setSelected(zone: string | null) { selected = zone; repaintAll(); },
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

export type Stage = ReturnType<typeof createStage>;

/** Lo que el componente necesita de la escena de cualquier región. */
export type SceneController = {
  setFracture(id: string): void;
  setReduced(reduced: boolean): void;
  setImplants(on: Set<string>): void;
  setSelected(zone: string | null): void;
  setView(view: string): void;
  dispose(): void;
};
export type SceneCallbacks = { onSelect(zone: string | null): void };
export type SceneFactory = (THREE: Three, OrbitControls: typeof OrbitControlsType, container: HTMLElement, callbacks: SceneCallbacks) => SceneController;
