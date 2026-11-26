// Catálogo de implantes del Atlas de osteosíntesis: agrupa los ítems de Traumatología de la programación
// HECAM 2026 por familia de producto, región y material, con una explicación de cada familia.
// Es material de formación interno: no sustituye el criterio del cirujano ni los pliegos.
import type { HecamItem } from "./hecam.ts";

export type FamilyId =
  | "placas-anatomicas" | "placas-generales" | "miniplacas" | "clavos" | "cefalomedulares" | "tornillos"
  | "fijadores" | "agujas-cables" | "partes-blandas" | "protesis" | "injertos-cemento" | "columna" | "otros";

export type Family = {
  id: FamilyId;
  name: string;
  /** Una línea para la lista. */
  short: string;
  what: string;
  principle: string;
  where: string;
  watch: string[];
  tender: string[];
};

export const FAMILIES: Family[] = [
  {
    id: "placas-anatomicas",
    name: "Placas anatómicas bloqueadas",
    short: "Placas precontorneadas por región, con tornillos bloqueados.",
    what: "Placas cuya forma sigue el hueso de una región concreta (radio distal, húmero proximal, tibia distal, fémur distal, clavícula, peroné) y que aceptan tornillos bloqueados, a veces de ángulo variable.",
    principle: "Actúan como un fijador interno: el tornillo se enrosca en la placa y forma una estructura rígida de ángulo estable, que no depende de que la placa comprima el hueso. Sirven en hueso osteoporótico y en fracturas cercanas a la articulación, donde queda poco hueso donde agarrar.",
    where: "Fracturas metafisarias y articulares: radio distal, húmero proximal y distal, clavícula, tibia proximal y distal, fémur proximal y distal, peroné distal, calcáneo.",
    watch: [
      "Cada placa es específica de una región y de un lado (derecho o izquierdo) y de una longitud (número de orificios).",
      "El diámetro de los tornillos define el instrumental: 2,4 y 2,7 mm en muñeca, 3,5 mm en hueso mediano, 4,5 y 5,0 mm en hueso grande.",
      "Los tornillos de ángulo variable permiten orientarse dentro de un cono antes de bloquearse; los de ángulo fijo no.",
    ],
    tender: [
      "Confirmar el lado, el número de orificios y que los tornillos bloqueados vengan incluidos o se coticen aparte.",
      "Revisar si el instrumental (guías, brocas, medidores) se presta o se entrega con la compra.",
      "Comparar placas de la misma región y de la misma serie de diámetro de tornillo; precios de regiones distintas no se comparan.",
    ],
  },
  {
    id: "placas-generales",
    name: "Placas rectas y especiales",
    short: "Placas contorneables y de uso específico: recta, tercio de caña, reconstrucción, cuña, gancho, en 8, pélvicas.",
    what: "Placas que se moldean durante la cirugía o que cumplen una función particular: diafisarias rectas (LCP), tercio de caña, de reconstrucción pélvica, en cuña para osteotomías, en gancho (maléolo, olécranon), en 8 para guiar el crecimiento, y para fracturas pélvicas.",
    principle: "Según cómo se usen cumplen funciones distintas: compresión entre fragmentos, neutralización de un tornillo, puente sobre una zona conminuta o soporte (contrafuerte) de una pared. La placa en 8 frena el crecimiento de un lado de la fisis para corregir la deformidad.",
    where: "Diáfisis de huesos largos, peroné, pelvis, olécranon, osteotomías de fémur y tibia, y corrección de deformidades en niños.",
    watch: [
      "Los precios varían mucho entre una placa recta de 3,5 mm y una pélvica o de reconstrucción; no se comparan entre sí.",
      "Una placa de ángulo estable (LCP) acepta tornillos convencionales y bloqueados; una convencional solo los primeros.",
    ],
    tender: [
      "Fijarse en el espesor, el ancho, el número de orificios y el tipo de tornillo compatible.",
      "Algunos ítems cotizan por sistema (placa más tornillos) y otros solo la placa; hay que leer qué incluye el ítem.",
    ],
  },
  {
    id: "miniplacas",
    name: "Miniplacas",
    short: "Placas pequeñas de 1,5 a 4,0 mm para hueso fino.",
    what: "Sistemas de placas y tornillos de pequeño diámetro (1,5, 2,0, 2,7, 3,5 y 4,0 mm) para huesos de la mano, el pie, huesos finos o fragmentos pequeños.",
    principle: "Igual que las placas grandes, pero con tornillos finos y perfil bajo para no irritar tendones ni piel. Muchas combinan tornillos bloqueados de ángulo variable y convencionales.",
    where: "Metacarpianos y falanges, huesos del pie, clavícula distal, fragmentos pequeños de otras fracturas.",
    watch: ["El diámetro de 1,5 mm es mucho más fino que el de 3,5 mm; no son intercambiables entre sí ni con el instrumental de otro diámetro."],
    tender: ["Pedir que se detalle el diámetro del sistema, el rango de longitudes de tornillo y el instrumental incluido."],
  },
  {
    id: "clavos",
    name: "Clavos endomedulares",
    short: "Fijación dentro del canal del hueso: fémur, tibia, húmero y clavos elásticos pediátricos.",
    what: "Varillas que se introducen por el canal medular del hueso largo, rectas o ligeramente curvas, de titanio o acero, a veces recubiertas de antibiótico. Incluyen clavos elásticos pediátricos (TEN) y clavos telescopados (Fassier-Duval).",
    principle: "Comparten la carga con el hueso (el clavo y el hueso trabajan juntos) y se colocan con poca agresión a las partes blandas. Los tornillos de bloqueo proximales y distales controlan la rotación y la longitud. Los clavos elásticos mantienen la alineación en niños sin dañar la fisis, y los telescopados crecen con el niño en huesos frágiles como en la osteogénesis imperfecta.",
    where: "Diáfisis de fémur, tibia y húmero en adultos; fracturas diafisarias en niños (clavos elásticos); osteogénesis imperfecta (telescopados).",
    watch: [
      "El diámetro y la longitud del clavo se eligen con la radiografía de cada paciente, así que el hospital suele pedir un rango de medidas.",
      "Hay que cotizar los tornillos de bloqueo y la guía de inserción si el ítem no los incluye.",
    ],
    tender: ["Revisar el rango de diámetros y longitudes ofertado, y si el ítem incluye los tornillos de bloqueo y el instrumental de inserción."],
  },
  {
    id: "cefalomedulares",
    name: "Clavos cefalomedulares",
    short: "Clavo intramedular con tornillo hacia la cabeza femoral, para fracturas del fémur proximal.",
    what: "Clavo endomedular de fémur proximal con un tornillo (o una hoja) cefálico que entra hacia la cabeza femoral. Los hay antirrotacionales y de compresión.",
    principle: "Estabilizan una fractura de la región trocantérica: el clavo sostiene el fémur por dentro y el elemento cefálico mantiene la cabeza, con la opción de comprimir el foco y de impedir que la cabeza gire.",
    where: "Fracturas pertrocantéreas y subtrocantéreas del fémur, frecuentes en personas mayores con osteoporosis.",
    watch: ["El ángulo cervicodiafisario y la longitud del clavo se eligen según el paciente.", "Los precios adjudicados varían según el sistema antirrotacional o de compresión."],
    tender: ["Mirar qué elemento cefálico incluye (tornillo, hoja, o dos), el ángulo del clavo y las longitudes disponibles."],
  },
  {
    id: "tornillos",
    name: "Tornillos",
    short: "Canulados, de compresión sin cabeza (Herbert), de interferencia, subtalar, de Ganz.",
    what: "Tornillos sueltos para funciones específicas: canulados (se pasan sobre una aguja guía), de compresión sin cabeza con rosca variable (tipo Herbert), de interferencia para fijar ligamentos, subtalar para artrorisis y de Ganz con arandela.",
    principle: "El tornillo de rosca variable comprime el foco cuando entra, sin que la cabeza sobresalga; el canulado permite colocarlo con precisión sobre una aguja guía; el de interferencia fija un injerto de ligamento dentro del túnel óseo.",
    where: "Fracturas pequeñas de escafoides y de huesos del carpo y del pie, cuello femoral, reconstrucción de ligamentos, osteotomías pélvicas, artrorisis del pie plano.",
    watch: ["El material (acero o titanio) y el rango de longitudes y diámetros definen el instrumental necesario."],
    tender: ["Aclarar si el ítem es un tornillo suelto, un kit con instrumental o un sistema con guías."],
  },
  {
    id: "fijadores",
    name: "Fijadores externos",
    short: "Dispositivos fuera de la piel con pines al hueso: lineales, circulares, híbridos, de pelvis.",
    what: "Sistemas de pines y barras (o anillos, en el tipo Ilizarov) que sostienen el hueso desde el exterior. Hay kits descartables lineales para tibia, fémur, húmero y antebrazo, sistemas circulares tipo Ilizarov, híbridos y para pelvis.",
    principle: "Mantienen la alineación sin abrir el foco de fractura, útiles con daño de partes blandas o fracturas abiertas, y los circulares permiten corregir deformidades y alargar huesos de forma gradual. En la muñeca, el fijador puente mantiene la reducción por ligamentotaxis.",
    where: "Fracturas abiertas, politraumatizados, fracturas muy conminutas, corrección de deformidades y alargamiento, fracturas de pelvis.",
    watch: ["Exigen cuidado de los pines por la infección en el trayecto.", "Cada kit es específico de un hueso: el de antebrazo no sirve para tibia."],
    tender: ["Verificar para qué hueso es el kit, cuántos pines y barras trae, y si es desechable o reutilizable."],
  },
  {
    id: "agujas-cables",
    name: "Agujas, alambres y cables",
    short: "Agujas de Kirschner, alambres y cables de cerclaje.",
    what: "Agujas de Kirschner lisas o roscadas, alambres de cerclaje en rollo de 1,2 a 1,5 mm y cables de cerclaje.",
    principle: "Las agujas dan fijación provisional o definitiva mínima en fragmentos pequeños y guían los tornillos canulados. El alambre en banda de tensión convierte la tracción del músculo en compresión sobre la fractura, como en olécranon y rótula. El cerclaje rodea el hueso y mantiene fragmentos en fracturas largas o periprotésicas.",
    where: "Muñeca, mano, olécranon, rótula, fracturas periprotésicas, osteotomías.",
    watch: ["Son los ítems de mayor rotación y menor precio; se piden por cientos."],
    tender: ["Revisar diámetros y longitudes y si el empaque es estéril por unidad."],
  },
  {
    id: "partes-blandas",
    name: "Anclas y reparación de partes blandas",
    short: "Anclas, suturas meniscales, fijación acromioclavicular y de sindesmosis, botones.",
    what: "Anclas de sutura (de titanio, reabsorbibles o no reabsorbibles, con o sin nudo), suturas meniscales todo adentro, kits de reparación acromioclavicular, de sindesmosis, de ligamento patelofemoral y de inestabilidad de tobillo, y botones para fijar ligamentos.",
    principle: "Fijan un tendón, un ligamento o un tejido blando al hueso, o estabilizan una articulación sin abrirla de forma extensa, a menudo por artroscopia.",
    where: "Manguito rotador, labrum del hombro, menisco, ligamentos de rodilla y tobillo, luxación acromioclavicular.",
    watch: ["Hay anclas por articulación y por material, y las reabsorbibles se prefieren cuando no se quiere dejar un implante permanente."],
    tender: ["Comparar por tipo de ancla, material, con o sin nudo y por la región de uso."],
  },
  {
    id: "protesis",
    name: "Prótesis articulares",
    short: "Cadera, rodilla, hombro, tobillo, cabeza radial y megaprótesis.",
    what: "Reemplazos de la articulación: prótesis totales y parciales de cadera, de rodilla (primarias y de revisión), de hombro reversa, de tobillo, de cúpula radial y megaprótesis para resecciones oncológicas. Incluyen componentes de acetábulo, aumentos y copas de revisión.",
    principle: "Sustituyen la superficie articular dañada por un par articular (metal, cerámica, polietileno). Pueden ser cementadas, que se fijan con cemento, o no cementadas, que dependen del crecimiento del hueso sobre la superficie.",
    where: "Artrosis avanzada, fracturas de cuello femoral, revisiones por aflojamiento o infección, tumores óseos.",
    watch: ["El par articular (cerámica sobre cerámica, cerámica sobre polietileno, metal sobre polietileno) y la forma de fijación cambian el precio.", "Los ítems de revisión y megaprótesis son de precio muy alto."],
    tender: ["Leer si el ítem trae todos los componentes (vástago, cabeza, inserto, cotilo) o solo uno."],
  },
  {
    id: "injertos-cemento",
    name: "Cementos, sustitutos óseos e injertos",
    short: "Cemento con antibiótico, sustitutos óseos, biocerámica, aloinjertos y sustitutos tendinosos.",
    what: "Cemento quirúrgico con uno o dos antibióticos (alta o baja viscosidad), sustitutos óseos desmineralizados, biocerámica de vidrio bioactivo, membranas de colágeno, aloinjertos de menisco y sustitutos tendinosos.",
    principle: "El cemento fija las prótesis cementadas y puede liberar antibiótico en el sitio. Los sustitutos óseos y la biocerámica rellenan defectos y favorecen la formación de hueso. Los injertos de tendón reconstruyen ligamentos.",
    where: "Artroplastia cementada, revisión protésica, defectos óseos, reconstrucción ligamentaria.",
    watch: ["Son materiales de origen biológico o con trazabilidad especial; hay que revisar el registro sanitario."],
    tender: ["Verificar volumen o peso por unidad, tipo de antibiótico y condiciones de conservación."],
  },
  {
    id: "columna",
    name: "Columna",
    short: "Sistemas de fijación, cajas intersomáticas, mallas y kits de cifoplastia.",
    what: "Sistemas de estabilización cervical, toracolumbar y lumbosacra con tornillos y barras, cajas intersomáticas, mallas de reemplazo de cuerpo vertebral, correctores de escoliosis y kits de cifoplastia.",
    principle: "Estabilizan segmentos de la columna con tornillos pediculares y barras, y mantienen el espacio entre vértebras con cajas hasta que se fusionen.",
    where: "Fracturas vertebrales, escoliosis, espondilolistesis, estabilización cervical.",
    watch: ["Son sistemas completos con muchas piezas; hay que ver qué componentes incluye el ítem."],
    tender: ["Leer qué trae el sistema: tornillos, barras, conectores, instrumental."],
  },
  {
    id: "otros",
    name: "Otros implantes",
    short: "Implantes metálicos que no entran en otra familia.",
    what: "Ítems de implantes que no corresponden a una familia anterior.",
    principle: "Ver la descripción de cada ítem.",
    where: "Según el ítem.",
    watch: [],
    tender: [],
  },
];

export const FAMILY_BY_ID: Record<FamilyId, Family> = Object.fromEntries(FAMILIES.map((f) => [f.id, f])) as Record<FamilyId, Family>;

/** Ítems de Traumatología que no son implantes (curación, vendas, aspiración, electrodos, shaver...). */
const CONSUMABLE = /venda|paquete quir|aspiraci[oó]n negativa|ap[oó]sito|electrodo|radiofrecuencia|shaver|hialur|superoxidaci|sierra de gigli|posicionador|iniciador|pistola|sutura de alta resistencia|aguja (de punci[oó]n|para biopsia)|malla no adherente|hilano|pasador/i;

/** Clasifica un ítem de la programación; devuelve null si no es un implante. */
export function classify(item: Pick<HecamItem, "c" | "n" | "e">): FamilyId | null {
  const n = item.n ?? "";
  const e = item.e ?? "";
  if (!/^Traumatolog/i.test(e) && !/kirschner/i.test(n)) return null;
  if (CONSUMABLE.test(n)) return null;
  if (/fijador|fijaci[oó]n externa|tutor|ilizarov|halo-chaleco/i.test(n)) return "fijadores";
  if (/kirschner|cerclaje/i.test(n)) return "agujas-cables";
  if (/cefalomedular/i.test(n)) return "cefalomedulares";
  if (/clavo/i.test(n)) return "clavos";
  if (/columna|vertebr|cervical|intersom[aá]tica|odontoides|interespinoso|espondilolistesis|escoliosis|cifoplastia|malla de titanio|toracolumbar|lumbar/i.test(n)) return "columna";
  if (/pr[oó]t[eé]sis|endopr[oó]tesis|acet[aá]bulo|acetabular|copa |c[uú]pula/i.test(n)) return "protesis";
  if (/cemento|sustituto|injerto|biocer[aá]mica|membrana de col[aá]geno/i.test(n)) return "injertos-cemento";
  if (/ancla|menisc|acromioclavicular|sindesmosis|patelofemoral|femorotibial|inestabilidad de tobillo|estabilizaci[oó]n de tobillo|osteocondral/i.test(n)) return "partes-blandas";
  if (/miniplaca|mini placa/i.test(n)) return "miniplacas";
  if (/placa/i.test(n)) return /anat[oó]mica|lcp anat|bloquead|bloqueda|premoldeada|precontorneada/i.test(n) ? "placas-anatomicas" : "placas-generales";
  if (/tornillo/i.test(n)) return "tornillos";
  if (/^09-/.test(item.c ?? "")) return "otros";
  return null;
}

export type Region =
  | "Muñeca y antebrazo" | "Codo" | "Hombro y clavícula" | "Pelvis y cadera" | "Fémur" | "Rodilla"
  | "Tibia y tobillo" | "Columna" | "Mano y pie" | "General";

export const REGIONS: Region[] = [
  "Muñeca y antebrazo", "Codo", "Hombro y clavícula", "Pelvis y cadera", "Fémur", "Rodilla",
  "Tibia y tobillo", "Columna", "Mano y pie", "General",
];

const REGION_RULES: [Region, RegExp][] = [
  ["Codo", /ol[eé]cranon|codo|c[uú]pula radial/i],
  ["Muñeca y antebrazo", /\bradio\b|mu[ñn]eca|antebrazo|c[uú]bito/i],
  ["Hombro y clavícula", /h[uú]mero|hombro|clav[ií]cula|acromioclavicular|manguito|labrum/i],
  ["Rodilla", /rodilla|menisc|patelo|femorotibial/i],
  ["Pelvis y cadera", /pelv|acet[aá]bul|cadera|iliaco|thompson|\bcopa\b/i],
  ["Fémur", /\bf[eé]mur|\bfemoral|cefalomedular|trocant/i],
  ["Tibia y tobillo", /tibia|tobillo|peron[eé]|calc[aá]neo|subtalar|sindesmosis|aquiles|\bpie\b/i],
  ["Columna", /columna|vertebr|cervical|intersom[aá]tica|odontoides|interespinoso|espondilolistesis|escoliosis|cifoplastia|malla de titanio|toracolumbar|lumbar/i],
  ["Mano y pie", /miniplaca|mini placa|herbert|minifragmento/i],
];

export function regionOf(name: string): Region {
  for (const [r, re] of REGION_RULES) if (re.test(name)) return r;
  return "General";
}

export type Material = "Acero" | "Titanio" | "Cerámica o circonio" | "Reabsorbible" | "No indicado";
export const MATERIALS: Material[] = ["Acero", "Titanio", "Cerámica o circonio", "Reabsorbible", "No indicado"];

export function materialOf(name: string): Material {
  if (/reabsorb|biodegrad|bioactivo/i.test(name)) return "Reabsorbible";
  if (/acero/i.test(name)) return "Acero";
  if (/titanio/i.test(name)) return "Titanio";
  if (/cer[aá]mica|circonio/i.test(name)) return "Cerámica o circonio";
  return "No indicado";
}

export type CatalogRow = {
  code: string;
  name: string;
  unit: string;
  family: FamilyId;
  region: Region;
  material: Material;
  pur?: number;
  pua?: number;
  q?: number;
  /** Precio muy inferior a lo habitual en su familia: conviene revisar unidad y presentación en el pliego. */
  low?: boolean;
};

export function buildCatalog(items: HecamItem[]): CatalogRow[] {
  const rows: CatalogRow[] = [];
  for (const it of items) {
    const family = classify(it);
    if (!family) continue;
    rows.push({
      code: it.c ?? "",
      name: it.n,
      unit: it.u ?? "",
      family,
      region: regionOf(it.n),
      material: materialOf(it.n),
      pur: it.pur ?? undefined,
      pua: it.pua ?? undefined,
      q: it.q ?? undefined,
    });
  }
  return flagLowPrices(rows);
}

const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};

const PRICE_CHECK_FAMILIES: FamilyId[] = ["placas-anatomicas", "placas-generales", "miniplacas", "clavos", "cefalomedulares", "fijadores"];

/** Marca los ítems cuyo precio es menor que el 15 % de la mediana de su familia (solo familias de implantes comparables entre sí y con 4 o más precios). */
export function flagLowPrices(rows: CatalogRow[]): CatalogRow[] {
  const byFamily = new Map<FamilyId, number[]>();
  for (const r of rows) {
    const p = bestPrice(r);
    if (p !== undefined && p > 0) byFamily.set(r.family, [...(byFamily.get(r.family) ?? []), p]);
  }
  const med = new Map<FamilyId, number>();
  for (const [f, xs] of byFamily) if (xs.length >= 4 && PRICE_CHECK_FAMILIES.includes(f)) med.set(f, median(xs));
  return rows.map((r) => {
    const p = bestPrice(r);
    const m = med.get(r.family);
    return p !== undefined && m !== undefined && p > 0 && p < m * 0.15 ? { ...r, low: true } : r;
  });
}

export type CatalogFilter = {
  family?: FamilyId | "";
  query?: string;
  region?: Region | "";
  material?: Material | "";
  onlyPriced?: boolean;
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function filterRows(rows: CatalogRow[], f: CatalogFilter): CatalogRow[] {
  const q = fold(f.query ?? "").trim();
  return rows.filter((r) => {
    if (f.family && r.family !== f.family) return false;
    if (f.region && r.region !== f.region) return false;
    if (f.material && r.material !== f.material) return false;
    if (f.onlyPriced && r.pur === undefined && r.pua === undefined) return false;
    if (q && !fold(`${r.code} ${r.name}`).includes(q)) return false;
    return true;
  });
}

export function familyCounts(rows: CatalogRow[]): Record<FamilyId, number> {
  const out = Object.fromEntries(FAMILIES.map((f) => [f.id, 0])) as Record<FamilyId, number>;
  for (const r of rows) out[r.family]++;
  return out;
}

/** Precio de referencia de una fila: el adjudicado si existe, si no el referencial. */
export function bestPrice(r: Pick<CatalogRow, "pur" | "pua">): number | undefined {
  return r.pua ?? r.pur;
}

export type MaterialGuide = { name: string; properties: string[]; typicalUse: string; note: string };

export const MATERIALS_GUIDE: MaterialGuide[] = [
  {
    name: "Acero inoxidable quirúrgico",
    properties: ["Rígido y resistente.", "Costo más bajo que el titanio.", "Produce más artefacto en la resonancia magnética."],
    typicalUse: "Placas y tornillos de uso general, clavos, fijadores externos, alambres y cerclajes.",
    note: "En los ítems del HECAM aparece como «acero quirúrgico».",
  },
  {
    name: "Titanio y sus aleaciones",
    properties: ["Más liviano y de rigidez más cercana a la del hueso que el acero.", "Muy buena biocompatibilidad y menos artefacto en la resonancia.", "Más caro; el hueso puede crecer sobre el implante y volver más difícil su retiro."],
    typicalUse: "Clavos endomedulares, placas, tornillos canulados, anclas, sistemas de columna y componentes protésicos.",
    note: "En el HECAM suele pedirse de forma explícita («de titanio»); si el pliego no lo dice, no se puede asumir.",
  },
  {
    name: "Cobalto-cromo, cerámica y polietileno",
    properties: ["Se usan como superficies de fricción de las prótesis (el par articular).", "La cerámica resiste el desgaste; el polietileno de alto peso molecular absorbe cargas.", "El circonio oxidado combina una superficie dura con un núcleo metálico."],
    typicalUse: "Cabezas, insertos y cotilos de prótesis de cadera y rodilla.",
    note: "El par articular (cerámica/cerámica, cerámica/polietileno, metal/polietileno) cambia el precio.",
  },
  {
    name: "Materiales reabsorbibles",
    properties: ["Se degradan en el cuerpo con el tiempo.", "Evitan dejar un implante permanente y una segunda cirugía de retiro.", "Menor resistencia mecánica que el metal."],
    typicalUse: "Anclas biodegradables para hombro y manguito rotador, algunos tornillos y fijaciones.",
    note: "Aparecen como «biodegradables» o «reabsorbibles» en los ítems.",
  },
  {
    name: "PEEK y materiales radiolúcidos",
    properties: ["Se ven con rayos X y no producen artefacto en tomografía ni resonancia.", "Rigidez parecida a la del hueso."],
    typicalUse: "Cajas intersomáticas de columna y algunos implantes que necesitan seguimiento por imagen.",
    note: "No aparecen como tal en la programación del HECAM; se mencionan por contexto.",
  },
  {
    name: "Cemento y sustitutos óseos",
    properties: ["El cemento acrílico fija prótesis y puede llevar antibiótico.", "Los sustitutos óseos desmineralizados y la biocerámica rellenan defectos y favorecen el hueso nuevo."],
    typicalUse: "Prótesis cementadas, defectos óseos, revisión protésica.",
    note: "Ver «Cementos, sustitutos óseos e injertos».",
  },
];
