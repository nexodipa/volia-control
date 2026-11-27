// Regiones disponibles en el Atlas de osteosíntesis. Cada una es un módulo de datos (zonas, implantes, fracturas,
// lecciones, quiz) más una escena 3D que se carga solo al elegirla. Para añadir una región: escribir su contenido
// con la forma de RegionContent, su escena sobre osteo-engine.ts y registrarla aquí y en OsteoAtlas.
import {
  IMPLANTS, LESSONS, MEASURES, PATTERNS, QUIZ, SOURCES, ZONES,
} from "./osteo-atlas.ts";
import type { RegionContent } from "./osteo-region.ts";
import { TIBIA_REGION } from "./osteo-tibia.ts";

export const RADIUS_REGION: RegionContent = {
  id: "radius",
  label: "Radio distal",
  sceneId: "radius",
  intro: "Radio distal: toque una parte del hueso o de un implante para ver qué es, qué se cuida y qué producto lo cubre.",
  modelLabel: "Modelo 3D del radio distal",
  views: [
    { id: "volar", label: "Volar" },
    { id: "dorsal", label: "Dorsal" },
    { id: "radial", label: "Radial" },
    { id: "articular", label: "Articular" },
  ],
  firstView: "volar",
  zones: ZONES,
  partButtons: [
    "radius-articular", "radius-styloid", "radius-volar-rim", "radius-lister", "radius-sigmoid",
    "radius-metaphysis", "radius-shaft", "ulna-head", "ulna-styloid", "carpus",
  ],
  zoneView: {
    "radius-articular": "articular", "radius-styloid": "radial", "radius-volar-rim": "volar",
    "radius-lister": "dorsal", "radius-sigmoid": "volar", plate: "volar",
  },
  implants: IMPLANTS,
  patterns: PATTERNS,
  patternOrder: ["none", "a2", "b3", "c2"],
  measuresCaption: "Cinco medidas de la radiografía",
  measures: MEASURES,
  lessons: LESSONS,
  quiz: QUIZ,
  quizPraise: "Buen dominio del radio distal. El siguiente paso es otra región del atlas.",
  sources: SOURCES,
  catalogModel: { "placas-anatomicas": "plate", "agujas-cables": "kwires", fijadores: "exfix" },
};

export const ATLAS_REGIONS: RegionContent[] = [RADIUS_REGION, TIBIA_REGION];

export function atlasRegion(id: string): RegionContent {
  return ATLAS_REGIONS.find((r) => r.id === id) ?? RADIUS_REGION;
}
