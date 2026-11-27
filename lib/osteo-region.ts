// Estructura común de una región del Atlas de osteosíntesis (radio distal, tibia...). Cada región trae su contenido
// (zonas, implantes, patrones de fractura, lecciones, quiz) como datos; el componente solo lo dibuja y el motor 3D
// lo muestra. Los identificadores son texto para que cualquier región defina los suyos.

export type SceneId = "radius" | "tibia" | "femur";

export type RegionZone = {
  id: string;
  name: string;
  summary: string;
  points: string[];
  /** Qué suele salir mal aquí. */
  watch?: string;
  implant?: string;
};

export type RegionImplant = {
  id: string;
  name: string;
  tagline: string;
  indications: string[];
  technique: string[];
  complications: string[];
  /** Ítems de la programación HECAM 2026 para ver precios. */
  hecam: { code: string; role: string }[];
};

export type RegionPattern = {
  id: string;
  /** Código AO/OTA 2018. */
  ao: string;
  name: string;
  classic?: string;
  summary: string;
  lookFor: string[];
  stability: string;
  usual: string[];
  why: string;
};

export type RegionMeasure = { name: string; normal: string; note: string };
export type RegionLesson = { id: string; title: string; summary: string; body: string[] };
export type RegionQuestion = { q: string; options: string[]; answer: number; why: string };
export type RegionSource = { title: string; url: string };

export type RegionContent = {
  id: string;
  /** Nombre corto para el selector de regiones. */
  label: string;
  sceneId: SceneId;
  /** Frase de la cabecera, después del título del atlas. */
  intro: string;
  /** Texto accesible del modelo 3D. */
  modelLabel: string;
  views: { id: string; label: string }[];
  firstView: string;
  zones: Record<string, RegionZone>;
  /** Zonas del hueso que se listan como botones, en orden. */
  partButtons: string[];
  /** Vista que deja ver mejor cada zona al elegirla de la lista. */
  zoneView: Record<string, string>;
  implants: Record<string, RegionImplant>;
  /** Primer patrón = sin fractura. */
  patterns: Record<string, RegionPattern>;
  patternOrder: string[];
  measuresCaption: string;
  measures: RegionMeasure[];
  lessons: RegionLesson[];
  quiz: RegionQuestion[];
  /** Mensaje al terminar el quiz con 80 % o más. */
  quizPraise: string;
  sources: RegionSource[];
  /** Familias del catálogo HECAM que tienen su implante dibujado en el modelo de esta región. */
  catalogModel: Record<string, string>;
};

export function regionHecamCodes(r: RegionContent): string[] {
  const set = new Set<string>();
  for (const i of Object.values(r.implants)) for (const h of i.hecam) set.add(h.code);
  return [...set];
}

export type QuizResult = { correct: number; total: number; pct: number };
export function gradeRegionQuiz(r: RegionContent, answers: (number | undefined)[]): QuizResult {
  let correct = 0;
  r.quiz.forEach((q, i) => { if (answers[i] === q.answer) correct++; });
  return { correct, total: r.quiz.length, pct: r.quiz.length ? Math.round((correct / r.quiz.length) * 100) : 0 };
}

/** Revisa que el contenido de una región sea coherente; devuelve los problemas encontrados (vacío = todo bien). */
export function validateRegion(r: RegionContent): string[] {
  const out: string[] = [];
  const zoneIds = new Set(Object.keys(r.zones));
  const implantIds = new Set(Object.keys(r.implants));
  const viewIds = new Set(r.views.map((v) => v.id));
  for (const [key, z] of Object.entries(r.zones)) {
    if (z.id !== key) out.push(`zona ${key}: el id no coincide`);
    if (z.implant && !implantIds.has(z.implant)) out.push(`zona ${key}: implante ${z.implant} no existe`);
    if (!z.points.length) out.push(`zona ${key}: sin puntos`);
  }
  for (const [key, i] of Object.entries(r.implants)) {
    if (i.id !== key) out.push(`implante ${key}: el id no coincide`);
    if (!i.hecam.length) out.push(`implante ${key}: sin ítems HECAM`);
  }
  for (const id of r.partButtons) if (!zoneIds.has(id)) out.push(`botón de parte ${id}: la zona no existe`);
  for (const [z, v] of Object.entries(r.zoneView)) {
    if (!zoneIds.has(z)) out.push(`vista de zona ${z}: la zona no existe`);
    if (!viewIds.has(v)) out.push(`vista de zona ${z}: la vista ${v} no existe`);
  }
  if (!viewIds.has(r.firstView)) out.push(`vista inicial ${r.firstView} no existe`);
  for (const id of r.patternOrder) {
    const p = r.patterns[id];
    if (!p) { out.push(`patrón ${id}: no existe`); continue; }
    if (p.id !== id) out.push(`patrón ${id}: el id no coincide`);
    for (const u of p.usual) if (!implantIds.has(u)) out.push(`patrón ${id}: implante ${u} no existe`);
  }
  if (Object.keys(r.patterns).length !== r.patternOrder.length) out.push("patrones fuera de patternOrder");
  r.quiz.forEach((q, i) => {
    if (q.answer < 0 || q.answer >= q.options.length) out.push(`pregunta ${i + 1}: respuesta fuera de rango`);
    if (new Set(q.options).size !== q.options.length) out.push(`pregunta ${i + 1}: opciones repetidas`);
  });
  for (const [fam, imp] of Object.entries(r.catalogModel)) if (!implantIds.has(imp)) out.push(`catálogo ${fam}: implante ${imp} no existe`);
  if (!r.sources.every((s) => /^https:\/\//.test(s.url))) out.push("fuente sin https");
  return out;
}
