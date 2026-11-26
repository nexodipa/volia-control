// Contenido del Atlas de osteosíntesis (versión interna de Volia): radio distal.
// Es material de formación comercial y de conversación con el cirujano, no una guía de tratamiento.
// Falta la revisión de un traumatólogo antes de usarlo fuera de Volia. No lleva datos de pacientes.

export type ImplantId = "plate" | "kwires" | "exfix";
export type FractureKey = "none" | "a2" | "b3" | "c2";

export type ZoneId =
  | "radius-shaft" | "radius-metaphysis" | "radius-articular" | "radius-styloid"
  | "radius-sigmoid" | "radius-lister" | "radius-volar-rim"
  | "ulna-head" | "ulna-styloid" | "carpus" | "metacarpal"
  | "plate" | "screw-distal" | "screw-prox" | "kwire" | "exfix-pin" | "exfix-bar";

export type Zone = {
  id: ZoneId;
  name: string;
  summary: string;
  points: string[];
  /** Qué suele salir mal aquí. */
  watch?: string;
  implant?: ImplantId;
};

export const ZONES: Record<ZoneId, Zone> = {
  "radius-shaft": {
    id: "radius-shaft",
    name: "Diáfisis del radio",
    summary: "Hueso tubular con una ligera curvatura; es donde se anclan los tornillos proximales de la placa.",
    points: [
      "La placa volar descansa sobre la cortical volar de la diáfisis y se fija con tornillos corticales (de 2,4 a 2,7 mm en el sistema AVL del ítem HECAM 09-0358).",
      "Restaurar la longitud y la rotación del radio importa más que lograr un contacto perfecto entre fragmentos metafisarios.",
      "La curvatura del radio es la que permite la pronosupinación: una placa mal contorneada o mal asentada puede dejar el hueso desalineado.",
    ],
    watch: "Un tornillo demasiado largo en la diáfisis sobresale por la cortical dorsal y roza los tendones extensores.",
  },
  "radius-metaphysis": {
    id: "radius-metaphysis",
    name: "Metáfisis distal",
    summary: "Hueso esponjoso con cortical delgada; es donde la mayoría de las fracturas del radio distal se rompen.",
    points: [
      "La cortical dorsal es la más delgada y se conmina primero: por eso las fracturas con desplazamiento dorsal pierden el apoyo y se vuelven inestables.",
      "La placa volar actúa como soporte (efecto de contrafuerte): sostiene la columna volar y deja que los tornillos bloqueados distales mantengan el hueso subcondral.",
      "En hueso osteoporótico el bloqueo placa-tornillo mantiene la fijación aunque el hueso esponjoso sea pobre; por eso se prefieren sistemas bloqueados.",
    ],
    watch: "La conminución dorsal es la que más se pierde de vista en la radiografía simple; la tomografía ayuda a planificar.",
    implant: "plate",
  },
  "radius-articular": {
    id: "radius-articular",
    name: "Superficie articular (fosas escafoidea y semilunar)",
    summary: "Dos fosas cóncavas, una para el escafoides (radial) y otra para el semilunar (cubital), separadas por una cresta.",
    points: [
      "Inclinación radial normal cercana a 22° en la proyección frontal e inclinación volar cercana a 11° en la lateral.",
      "Un escalón o separación articular mayor de 2 mm se considera, como referencia frecuente, una reducción inaceptable por el riesgo de artrosis postraumática.",
      "Una lateral con el haz inclinado hacia proximal (entre 10° y 20°) deja ver la superficie articular sin superponer el carpo.",
    ],
    watch: "Un tornillo bloqueado distal que penetra en la articulación no se ve en la proyección frontal estándar: hay que mirar varias proyecciones.",
    implant: "plate",
  },
  "radius-styloid": {
    id: "radius-styloid",
    name: "Estiloides radial",
    summary: "Prolongación distal del lado radial, a unos 11-12 mm por debajo del nivel de la cabeza cubital.",
    points: [
      "Aquí se inserta el músculo braquiorradial, que tiende a acortar y desplazar el fragmento.",
      "Su fractura aislada es la clásica de «chofer» (2R3B1 en AO/OTA) y se puede fijar con agujas de Kirschner, un tornillo canulado o una placa de fragmento específico (HECAM 09-0844).",
      "La altura radial (distancia desde la punta de la estiloides hasta la línea de la cabeza cubital) es una de las cinco mediciones que se controlan tras reducir.",
    ],
    watch: "Al entrar agujas por la estiloides se arriesga la rama sensitiva del nervio radial: se hace una incisión pequeña y se separa el tejido con disección roma.",
    implant: "kwires",
  },
  "radius-sigmoid": {
    id: "radius-sigmoid",
    name: "Escotadura sigmoidea (articulación radiocubital distal)",
    summary: "Superficie cóncava del lado cubital del radio donde rota la cabeza del cúbito durante la pronosupinación.",
    points: [
      "Una fractura que compromete la escotadura puede dejar inestable la articulación radiocubital distal.",
      "Tras fijar el radio hay que probar la estabilidad radiocubital distal con el antebrazo en pronación, supinación y posición neutra.",
      "Una fractura de la base de la estiloides cubital puede acompañar a una inestabilidad radiocubital distal y conviene tenerla presente al decidir.",
    ],
    watch: "Fijar bien el radio y olvidarse del cúbito deja un dolor y un chasquido que se atribuyen luego al implante.",
  },
  "radius-lister": {
    id: "radius-lister",
    name: "Tubérculo de Lister (dorsal)",
    summary: "Prominencia ósea en la cara dorsal del radio distal; el tendón extensor largo del pulgar (EPL) gira a su alrededor.",
    points: [
      "El EPL cambia de dirección en el borde cubital del tubérculo, justo donde puede rozar la punta de un tornillo.",
      "Los tornillos distales demasiado largos salen por la cortical dorsal y producen tendinitis o rotura del EPL, a veces semanas después de la cirugía.",
      "Se descarta con una proyección tangencial dorsal («skyline») durante la cirugía, antes de cerrar.",
    ],
    watch: "La rotura del EPL puede aparecer incluso sin fractura desplazada o sin implante; con un tornillo prominente el riesgo aumenta.",
    implant: "plate",
  },
  "radius-volar-rim": {
    id: "radius-volar-rim",
    name: "Borde volar y línea divisoria («watershed line»)",
    summary: "Cresta transversal volar del radio distal que marca el límite hasta donde puede llegar una placa sin tocar los tendones.",
    points: [
      "La placa debe quedar proximal a la línea divisoria o sobre ella; si pasa más allá contacta con el tendón flexor largo del pulgar (FPL).",
      "El músculo pronador cuadrado cubre esta zona y se reinserta al final como protección entre la placa y los tendones flexores.",
      "El borde volar sostiene al semilunar: si se fractura (2R3B3, tipo Barton volar) el carpo se subluxa hacia volar y proximal y la fractura es inestable.",
    ],
    watch: "Una placa demasiado distal causa tendinitis o rotura del FPL. Es una de las complicaciones más citadas de la placa volar.",
    implant: "plate",
  },
  "ulna-head": {
    id: "ulna-head",
    name: "Cabeza del cúbito",
    summary: "Extremo distal del cúbito; articula con la escotadura sigmoidea y se apoya en el complejo del fibrocartílago triangular (TFCC).",
    points: [
      "La varianza cubital (relación de longitud entre radio y cúbito en la articulación) es normalmente cercana a cero.",
      "Un radio acortado por la fractura aumenta la varianza positiva y carga el borde cubital de la muñeca (pinzamiento cubitocarpiano).",
    ],
  },
  "ulna-styloid": {
    id: "ulna-styloid",
    name: "Estiloides cubital",
    summary: "Pequeña prolongación del cúbito donde se inserta parte del complejo del fibrocartílago triangular.",
    points: [
      "Se fractura con frecuencia junto con el radio distal.",
      "Su importancia depende del tamaño del fragmento y de si queda inestable la articulación radiocubital distal; no toda estiloides fracturada se fija.",
    ],
  },
  carpus: {
    id: "carpus",
    name: "Carpo (escafoides y semilunar)",
    summary: "Huesos de la primera fila del carpo que se apoyan en las fosas del radio. Dibujo esquemático, no anatómico.",
    points: [
      "El escafoides se apoya en la fosa radial y el semilunar en la cubital.",
      "En las fracturas con desplazamiento el carpo se va con el fragmento distal; en un Barton volar se subluxa junto con el borde volar.",
      "Las lesiones asociadas (ligamento escafolunar, fractura de escafoides) se buscan en la radiografía y en la fluoroscopia.",
    ],
  },
  metacarpal: {
    id: "metacarpal",
    name: "Segundo metacarpiano",
    summary: "Hueso de la mano donde se colocan los pines distales del fijador externo puente.",
    points: [
      "Los pines van por la diáfisis del segundo metacarpiano, con una incisión corta para proteger tendones y ramas sensitivas.",
    ],
    implant: "exfix",
  },
  plate: {
    id: "plate",
    name: "Placa volar anatómica bloqueada",
    summary: "Implante de elección para muchas fracturas inestables del radio distal; se coloca por vía volar sobre la cortical volar.",
    points: [
      "Anatómica: su forma sigue el radio distal; la cabeza ancha aloja una hilera subcondral de tornillos bloqueados.",
      "Bloqueada: los tornillos se enroscan en la placa y forman una estructura rígida que no depende de la calidad del hueso.",
      "Referencias HECAM: 09-0358 (placa anatómica de radio distal volar AVL 2,4/2,7 mm) y 09-0844 (placas de fragmento específico).",
    ],
    watch: "Colocarla demasiado distal (pasando la línea divisoria) toca el flexor largo del pulgar.",
    implant: "plate",
  },
  "screw-distal": {
    id: "screw-distal",
    name: "Tornillos bloqueados distales",
    summary: "Hilera subcondral que sostiene la superficie articular desde abajo, como un andamio.",
    points: [
      "Se colocan paralelos a la superficie articular, a pocos milímetros del hueso subcondral, para sostener los fragmentos.",
      "Su longitud se mide con cuidado: ni cortos (pierden el agarre del fragmento dorsal) ni largos (salen por el dorso).",
      "Se controlan con fluoroscopia en frontal, lateral inclinada y tangencial dorsal.",
    ],
    watch: "Un tornillo largo irrita o rompe el extensor largo del pulgar (EPL) junto al tubérculo de Lister.",
    implant: "plate",
  },
  "screw-prox": {
    id: "screw-prox",
    name: "Tornillos corticales proximales",
    summary: "Fijan la placa a la diáfisis; el primero que se coloca suele ir en el agujero ovalado para ajustar la altura.",
    points: [
      "Se usan tres o cuatro para anclar el cuerpo de la placa.",
      "Primero se afina la altura con el agujero ovalado y después se bloquean los tornillos distales.",
    ],
    implant: "plate",
  },
  kwire: {
    id: "kwire",
    name: "Agujas de Kirschner (1,6 mm)",
    summary: "Fijación percutánea con agujas lisas: poca agresión, útil en fracturas con buen hueso y poco desplazamiento.",
    points: [
      "Se entra por la estiloides radial y, a veces, por el borde dorsocubital, y se cruza el trazo hasta la cortical opuesta.",
      "Se combinan con yeso o férula, o con un fijador externo; se retiran a las pocas semanas.",
      "Referencias HECAM: 09-0211 (agujas lisas) y 06-0155 (roscadas).",
    ],
    watch: "Infección en el trayecto, migración de la aguja y lesión de la rama sensitiva del nervio radial.",
    implant: "kwires",
  },
  "exfix-pin": {
    id: "exfix-pin",
    name: "Pines del fijador externo",
    summary: "Dos pines en la diáfisis del radio y dos en el segundo metacarpiano, unidos por una barra que atraviesa la muñeca.",
    points: [
      "Los pines del radio se colocan por una incisión corta para proteger la rama sensitiva del nervio radial.",
      "Es un fijador «puente»: no entra en el foco de fractura, lo mantiene alineado por ligamentotaxis.",
    ],
    watch: "Infección en el trayecto del pin y fractura a través del orificio del pin.",
    implant: "exfix",
  },
  "exfix-bar": {
    id: "exfix-bar",
    name: "Barra del fijador externo",
    summary: "Une los pines del radio y de la mano y mantiene la distracción que reduce la fractura.",
    points: [
      "La distracción por ligamentotaxis alinea los fragmentos tirando de las inserciones ligamentarias; la sobredistracción se asocia a rigidez de los dedos y distrofia simpática.",
      "Se usa en politraumatizados, fracturas abiertas o con daño de partes blandas, y como complemento de las agujas.",
      "Referencia HECAM cercana: 09-0621 (kit de fijadores externos desechables para antebrazo; no es específico de muñeca).",
    ],
    implant: "exfix",
  },
};

export type Implant = {
  id: ImplantId;
  name: string;
  tagline: string;
  indications: string[];
  technique: string[];
  complications: string[];
  /** Ítems de la programación HECAM 2026 para ver precios. */
  hecam: { code: string; role: string }[];
};

export const IMPLANTS: Record<ImplantId, Implant> = {
  plate: {
    id: "plate",
    name: "Placa volar bloqueada",
    tagline: "Implante más usado en fracturas inestables y articulares del radio distal.",
    indications: [
      "Fracturas inestables o con desplazamiento dorsal que no mantienen la reducción con yeso.",
      "Fracturas articulares que requieren una reducción anatómica y un soporte subcondral.",
      "Hueso osteoporótico, donde el bloqueo placa-tornillo mantiene la fijación.",
    ],
    technique: [
      "Abordaje volar por la vaina del flexor radial del carpo (FCR), protegiendo el nervio mediano y su rama palmar cutánea.",
      "Se desinserta el pronador cuadrado desde el lado radial y se reinserta al final.",
      "Se reduce el hueso (con agujas provisionales si hace falta) y se coloca la placa proximal a la línea divisoria.",
      "Primer tornillo en el agujero ovalado, ajuste de altura, tornillos bloqueados distales y luego los proximales.",
      "Se controla con fluoroscopia en frontal, lateral inclinada y tangencial dorsal antes de cerrar.",
    ],
    complications: [
      "Tendinitis o rotura del flexor largo del pulgar por una placa demasiado distal.",
      "Tendinitis o rotura del extensor largo del pulgar por tornillos prominentes en el dorso.",
      "Síndrome del túnel carpiano y síndrome doloroso regional complejo.",
      "Pérdida de la reducción o penetración articular de un tornillo.",
    ],
    hecam: [
      { code: "09-0358", role: "Placa anatómica de radio distal volar" },
      { code: "09-0844", role: "Placas de fragmento específico (muñeca)" },
    ],
  },
  kwires: {
    id: "kwires",
    name: "Agujas de Kirschner",
    tagline: "Fijación percutánea mínima; útil en fracturas con buen hueso y poco desplazamiento.",
    indications: [
      "Fracturas extraarticulares o parcialmente articulares estables tras la reducción cerrada.",
      "Fijación provisional mientras se coloca una placa.",
      "Fragmentos pequeños, como la estiloides radial.",
    ],
    technique: [
      "Reducción cerrada con control fluoroscópico.",
      "Entrada por la estiloides radial con una incisión pequeña y disección roma para proteger la rama sensitiva del nervio radial.",
      "Dirección oblicua hacia la cortical cubital proximal; a veces una tercera aguja por el dorso cubital.",
      "Inmovilización complementaria y retiro de las agujas a las pocas semanas.",
    ],
    complications: [
      "Infección en el trayecto de la aguja.",
      "Migración o aflojamiento y pérdida de la reducción.",
      "Lesión de la rama sensitiva del nervio radial.",
    ],
    hecam: [
      { code: "09-0211", role: "Agujas de Kirschner lisas" },
      { code: "06-0155", role: "Agujas de Kirschner roscadas" },
    ],
  },
  exfix: {
    id: "exfix",
    name: "Fijador externo puente",
    tagline: "Mantiene la reducción desde fuera por ligamentotaxis, sin abrir el foco.",
    indications: [
      "Politraumatizados que necesitan un control rápido del daño.",
      "Fracturas abiertas o con daño importante de partes blandas.",
      "Fracturas muy conminutas, sola o combinada con agujas.",
    ],
    technique: [
      "Dos pines en la diáfisis del radio por incisión corta y dos en el segundo metacarpiano.",
      "Barra de conexión; se reduce por tracción y se bloquea.",
      "Se evita la distracción excesiva para no rigidizar los dedos.",
    ],
    complications: [
      "Infección en el trayecto de los pines.",
      "Rigidez de los dedos y síndrome doloroso regional complejo por exceso de distracción.",
      "Pérdida de la reducción al retirar el fijador.",
    ],
    hecam: [{ code: "09-0621", role: "Kit de fijadores externos desechables para antebrazo (referencia cercana)" }],
  },
};

export type Pattern = {
  id: FractureKey;
  /** Código AO/OTA 2018 (2R3 = radio distal). */
  ao: string;
  name: string;
  classic?: string;
  summary: string;
  lookFor: string[];
  stability: string;
  usual: ImplantId[];
  why: string;
};

export const PATTERNS: Record<FractureKey, Pattern> = {
  none: {
    id: "none",
    ao: "—",
    name: "Radio distal sin fractura",
    summary: "Para ubicarse: nombres de las zonas, referencias óseas y planos de la placa volar.",
    lookFor: ["Toque cualquier zona del hueso para ver su explicación.", "Use las vistas para girar el modelo."],
    stability: "No aplica.",
    usual: [],
    why: "",
  },
  a2: {
    id: "a2",
    ao: "2R3A2",
    name: "Extraarticular simple (desplazamiento dorsal)",
    classic: "Fractura de Colles (término clásico)",
    summary: "Trazo metafisario simple que no toca la articulación. El fragmento distal se inclina al dorso, se acorta y se desvía hacia radial.",
    lookFor: [
      "Inclinación dorsal en la lateral (la volar normal es de unos 11°).",
      "Acortamiento radial y pérdida de la inclinación radial en la frontal.",
      "Deformidad «en dorso de tenedor» en la clínica.",
    ],
    stability: "Depende de la conminución dorsal, la edad y la calidad del hueso. Si se pierde la reducción tras la reducción cerrada, se considera inestable.",
    usual: ["kwires", "plate"],
    why: "Con poco desplazamiento y buen hueso puede bastar la reducción cerrada con yeso o agujas; si la reducción se pierde o hay conminución dorsal, la placa volar es la opción habitual.",
  },
  b3: {
    id: "b3",
    ao: "2R3B3",
    name: "Parcial articular: borde volar",
    classic: "Fractura de Barton volar (término clásico)",
    summary: "Un fragmento del borde volar, que incluye parte de la superficie articular, se desprende y arrastra al carpo hacia volar y proximal.",
    lookFor: [
      "Fragmento volar y subluxación del carpo en la lateral.",
      "Pérdida de la congruencia radiocarpiana.",
    ],
    stability: "Inestable: el carpo se subluxa si no se sostiene el borde volar.",
    usual: ["plate"],
    why: "Necesita un apoyo directo sobre el borde volar; la placa volar actúa como contrafuerte y evita que el carpo se vaya hacia volar.",
  },
  c2: {
    id: "c2",
    ao: "2R3C2",
    name: "Articular completa: articular simple, metáfisis multifragmentaria",
    summary: "La superficie articular se parte en un plano sagital (entre la fosa del escafoides y la del semilunar) y la metáfisis dorsal está conminuta.",
    lookFor: [
      "Escalón o separación articular mayor de 2 mm.",
      "Conminución dorsal metafisaria.",
      "Se suele pedir tomografía para planificar.",
    ],
    stability: "Muy inestable: la placa volar de soporte y los tornillos subcondrales sostienen la superficie articular.",
    usual: ["plate", "kwires", "exfix"],
    why: "Se busca una reducción anatómica de la superficie articular con placa volar bloqueada; las agujas ayudan a fijar fragmentos provisionalmente y el fijador externo es un recurso en conminución severa o daño de partes blandas.",
  },
};

export type Measure = { name: string; normal: string; note: string };

export const MEASURES: Measure[] = [
  { name: "Inclinación radial", normal: "≈ 22° (rango habitual 21-25°)", note: "Proyección frontal: ángulo entre la superficie articular y la perpendicular al eje del radio." },
  { name: "Altura radial", normal: "≈ 11-14 mm (según la serie)", note: "Distancia entre la punta de la estiloides y la línea de la superficie articular de la cabeza cubital." },
  { name: "Inclinación volar", normal: "≈ 11° (11° ± 5° en una serie)", note: "Proyección lateral: la superficie articular mira ligeramente hacia volar." },
  { name: "Varianza cubital", normal: "≈ 0 a −1 mm (0,7 ± 1,5 mm en una serie)", note: "Diferencia de longitud entre radio y cúbito a nivel articular." },
  { name: "Escalón articular", normal: "menos de 2 mm", note: "Desnivel o separación entre fragmentos de la superficie articular." },
];

export type Lesson = { id: string; title: string; summary: string; body: string[] };

export const LESSONS: Lesson[] = [
  {
    id: "medidas",
    title: "Las cinco medidas de la radiografía",
    summary: "Qué se mide y por qué importa tras reducir una fractura del radio distal.",
    body: [
      "Para decidir si una reducción es aceptable se miran cinco cosas en la radiografía: la inclinación radial y la altura radial en la proyección frontal, la inclinación volar en la lateral, la varianza cubital y el escalón articular.",
      "Cada una se compara con el lado sano o con un valor normal: inclinación radial cercana a 22°, inclinación volar cercana a 11°, varianza cubital cercana a cero y un escalón articular de menos de 2 mm.",
      "Estas medidas varían según la proyección y el observador. Un estudio encontró que las estimaciones a ojo difieren de las lecturas formales en cerca de un tercio de los casos, así que el cirujano mide y no estima.",
    ],
  },
  {
    id: "clasificacion",
    title: "Clasificación AO/OTA 2R3",
    summary: "Cómo se nombra una fractura del radio distal y qué dice el código.",
    body: [
      "En AO/OTA 2018 el radio distal se codifica como 2R3. El tipo A es extraarticular, el B es parcialmente articular y el C es articular completa.",
      "Ejemplos del atlas: 2R3A2 (extraarticular simple, el clásico Colles con desplazamiento dorsal), 2R3B3 (parcial articular del borde volar, el clásico Barton volar) y 2R3C2 (articular simple con metáfisis multifragmentaria).",
      "Los nombres propios (Colles, Smith, Barton, chofer) se siguen usando en la conversación diaria, pero la clasificación por código describe mejor la fractura y es la que se usa en la literatura.",
    ],
  },
  {
    id: "cuando-operar",
    title: "Cuándo se considera operar",
    summary: "Referencias frecuentes y por qué no son una regla fija.",
    body: [
      "Como referencia frecuente, tras una reducción cerrada se consideran signos de reducción inaceptable un acortamiento radial mayor de unos 3 mm, una inclinación dorsal mayor de unos 10° o un escalón articular mayor de 2 mm.",
      "Estos umbrales varían según la guía, la edad y la demanda funcional. En personas mayores de 60 años varios estudios no encuentran una correlación clara entre la alineación radiográfica y los resultados funcionales, por lo que la decisión es individual.",
      "Para Volia, lo útil es entender por qué un cirujano elige placa, agujas o fijador, y qué pide cada opción al proveedor.",
    ],
  },
  {
    id: "placa-volar",
    title: "Placa volar paso a paso",
    summary: "La secuencia habitual de una osteosíntesis con placa volar bloqueada.",
    body: [
      "Abordaje volar entre el flexor radial del carpo y la arteria radial, desinserción del pronador cuadrado y exposición de la cortical volar.",
      "Reducción de la fractura y fijación provisional con agujas de Kirschner.",
      "Colocación de la placa proximal a la línea divisoria, primer tornillo en el agujero ovalado, ajuste de altura, tornillos bloqueados distales y tornillos corticales proximales.",
      "Control con fluoroscopia en frontal, lateral inclinada y tangencial dorsal; reinserción del pronador cuadrado y cierre.",
    ],
  },
  {
    id: "complicaciones",
    title: "Complicaciones y cómo se evitan",
    summary: "Los errores de técnica más comunes y la estructura que se lesiona en cada uno.",
    body: [
      "Placa demasiado distal: contacta con el flexor largo del pulgar. Se evita colocándola proximal a la línea divisoria.",
      "Tornillo distal demasiado largo: sale por el dorso y roza el extensor largo del pulgar. Se evita midiendo con cuidado y mirando la proyección tangencial dorsal.",
      "Tornillo que entra en la articulación: se evita con lateral inclinada y rotaciones de la fluoroscopia.",
      "Entrada de agujas por la estiloides: puede lesionar la rama sensitiva del nervio radial; se usa incisión pequeña y disección roma.",
    ],
  },
];

export type Question = { q: string; options: string[]; answer: number; why: string };

export const QUIZ: Question[] = [
  { q: "¿Cuál es la inclinación radial normal aproximada del radio distal?", options: ["≈ 5°", "≈ 11°", "≈ 22°", "≈ 40°"], answer: 2, why: "La inclinación radial normal ronda 22° (rango habitual 21-25°). La de 11° es la inclinación volar." },
  { q: "¿Y la inclinación volar normal aproximada?", options: ["≈ 0° (plana)", "≈ 11°", "≈ 22°", "≈ 30°"], answer: 1, why: "La superficie articular mira ligeramente hacia volar, unos 11°." },
  { q: "¿A partir de qué escalón articular se suele considerar inaceptable la reducción?", options: ["Más de 0,5 mm", "Más de 1 mm", "Más de 2 mm", "Más de 5 mm"], answer: 2, why: "La referencia frecuente es más de 2 mm, por el riesgo de artrosis postraumática." },
  { q: "Una placa volar colocada demasiado distal, más allá de la línea divisoria, pone en riesgo…", options: ["El tendón extensor largo del pulgar", "El tendón flexor largo del pulgar", "El nervio cubital", "La arteria radial"], answer: 1, why: "Más allá de la línea divisoria la placa contacta con el flexor largo del pulgar (FPL)." },
  { q: "Un tornillo bloqueado distal demasiado largo que sale por el dorso irrita…", options: ["El extensor largo del pulgar, junto al tubérculo de Lister", "El flexor radial del carpo", "El pronador cuadrado", "El braquiorradial"], answer: 0, why: "El EPL gira alrededor del tubérculo de Lister y es el tendón que se irrita o rompe con tornillos prominentes en el dorso." },
  { q: "¿Qué código AO/OTA corresponde a una fractura articular completa con articular simple y metáfisis multifragmentaria?", options: ["2R3A2", "2R3B3", "2R3C2", "2R3B1"], answer: 2, why: "2R3C2: articular completa, con articular simple y metáfisis multifragmentaria." },
  { q: "Una fractura parcial articular del borde volar con subluxación del carpo (Barton volar) se codifica como…", options: ["2R3B3", "2R3A2", "2R3C3", "2R3B1"], answer: 0, why: "2R3B3 es la parcial articular del borde volar (frontal)." },
  { q: "¿Por qué abordaje se coloca habitualmente la placa volar?", options: ["Por el dorso, junto al tubérculo de Lister", "Por la vaina del flexor radial del carpo", "Por el cúbito distal", "Por vía percutánea sin incisión"], answer: 1, why: "Se aborda entre el flexor radial del carpo y la arteria radial, protegiendo el nervio mediano." },
  { q: "Al entrar agujas de Kirschner por la estiloides radial se arriesga principalmente…", options: ["La arteria cubital", "La rama sensitiva del nervio radial", "El nervio mediano en el túnel carpiano", "El ligamento escafolunar"], answer: 1, why: "La rama sensitiva superficial del nervio radial pasa cerca; se usa incisión pequeña y disección roma." },
  { q: "La ligamentotaxis es el principio que usa…", options: ["La placa volar bloqueada", "Las agujas de Kirschner", "El fijador externo puente", "El yeso circular"], answer: 2, why: "El fijador externo puente tracciona y alinea los fragmentos tirando de las inserciones ligamentarias." },
];

export type Source = { title: string; url: string };
export const SOURCES: Source[] = [
  { title: "Volar locked plating y parámetros radiográficos del radio distal (PMC3581353)", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3581353" },
  { title: "Valores radiográficos tras la fijación del radio distal (PMC9038308)", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC9038308" },
  { title: "Alineación y resultado funcional en mayores de 60 años (PMC6900695)", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6900695" },
  { title: "Variabilidad de la lectura de parámetros radiográficos (PMC4235921)", url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC4235921" },
  { title: "AO Surgery Reference: radio distal, fractura 2R3C2", url: "https://surgeryreference.aofoundation.org/orthopedic-trauma/adult-trauma/distal-forearm/complete-simple-articular-fragmented-metaphysis-radial-fracture/definition" },
];

export function allHecamCodes(): string[] {
  const set = new Set<string>();
  for (const i of Object.values(IMPLANTS)) for (const h of i.hecam) set.add(h.code);
  return [...set];
}

export type QuizResult = { correct: number; total: number; pct: number };
export function gradeQuiz(answers: (number | undefined)[]): QuizResult {
  let correct = 0;
  QUIZ.forEach((q, i) => { if (answers[i] === q.answer) correct++; });
  return { correct, total: QUIZ.length, pct: Math.round((correct / QUIZ.length) * 100) };
}
