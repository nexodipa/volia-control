// Fichas técnicas de producto en el formato rojo de Osteotech. Esta parte es pura (sin navegador):
// el modelo de datos, los cinco campos fijos del encabezado, la normalización de lo guardado y los avisos.
// El armado del Word, que clona la plantilla real, vive en fichas-docx.ts.

export type FichaProducto = {
  id: string;
  nombre: string;
  composicion: string;
  color: string;
  descripcion: string;
  informacion: string;
  indicaciones: string;
  /** Vacío = se conserva el texto estándar de la plantilla. */
  contraindicaciones: string;
  efectos: string;
  precauciones: string;
  limpieza: string;
  /** Siempre tres encabezados de columna (la tabla de la plantilla tiene tres). */
  columnas: string[];
  filas: string[][];
  /** "plantilla" = la foto de la plantilla; "base:NN" = foto incluida; "data:..." = foto propia; "" = sin foto. */
  foto: string;
};

export type FichaFijos = { pais: string; fabricante: string; importador: string; registro: string; riesgo: string };

export const FICHA_FIJOS: FichaFijos = {
  pais: "China",
  fabricante: "MINDRAY SCIENTIFIC Co., Ltda.",
  importador: "OSTEOTECH Implantes Quirúrgicos S.A.S",
  registro: "INVIMA 2016DM-0015022",
  riesgo: "III",
};

export type FichasState = { fichas: FichaProducto[]; fijos: FichaFijos; seleccion: string[] };

export const FICHA_COLUMNAS = 3;
export const MAX_FILAS = 40;

const str = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

export function normalizeFicha(raw: unknown, fallbackId: string): FichaProducto {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const columnas = Array.isArray(o.columnas) ? o.columnas.map((c) => str(c)) : [];
  while (columnas.length < FICHA_COLUMNAS) columnas.push("");
  const filas = (Array.isArray(o.filas) ? o.filas : []).slice(0, MAX_FILAS).map((row) => {
    const cells = Array.isArray(row) ? row.map((c) => str(c)) : [];
    while (cells.length < FICHA_COLUMNAS) cells.push("");
    return cells.slice(0, FICHA_COLUMNAS);
  });
  return {
    id: str(o.id) || fallbackId,
    nombre: str(o.nombre),
    composicion: str(o.composicion),
    color: str(o.color),
    descripcion: str(o.descripcion),
    informacion: str(o.informacion),
    indicaciones: str(o.indicaciones),
    contraindicaciones: str(o.contraindicaciones),
    efectos: str(o.efectos),
    precauciones: str(o.precauciones),
    limpieza: str(o.limpieza),
    columnas: columnas.slice(0, FICHA_COLUMNAS),
    filas,
    foto: str(o.foto),
  };
}

export function normalizeFijos(raw: unknown): FichaFijos {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    pais: str(o.pais) || FICHA_FIJOS.pais,
    fabricante: str(o.fabricante) || FICHA_FIJOS.fabricante,
    importador: str(o.importador) || FICHA_FIJOS.importador,
    registro: str(o.registro) || FICHA_FIJOS.registro,
    riesgo: str(o.riesgo) || FICHA_FIJOS.riesgo,
  };
}

/** Une lo guardado con las fichas base: lo base que falte vuelve a aparecer y lo propio se conserva. */
export function mergeFichas(base: FichaProducto[], saved: unknown): FichasState {
  const o = (saved && typeof saved === "object" ? saved : {}) as Record<string, unknown>;
  const savedList = Array.isArray(o.fichas) ? o.fichas.map((f, i) => normalizeFicha(f, `ficha-${i + 1}`)) : [];
  const byId = new Map(savedList.map((f) => [f.id, f]));
  const fichas = [...base.map((b) => byId.get(b.id) ?? b), ...savedList.filter((f) => !base.some((b) => b.id === f.id))];
  const ids = new Set(fichas.map((f) => f.id));
  const seleccion = Array.isArray(o.seleccion) ? o.seleccion.filter((id): id is string => typeof id === "string" && ids.has(id)) : base.map((b) => b.id);
  return { fichas, fijos: normalizeFijos(o.fijos), seleccion };
}

export function slugId(nombre: string, existing: string[]) {
  const base = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "ficha";
  if (!existing.includes(base)) return base;
  let n = 2;
  while (existing.includes(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export type FichaAviso = { campo: string; texto: string };

/** Lo que falta o sobra en una ficha antes de bajarla. No bloquea la descarga: el usuario decide. */
export function fichaAvisos(ficha: FichaProducto): FichaAviso[] {
  const avisos: FichaAviso[] = [];
  if (!ficha.nombre.trim()) avisos.push({ campo: "nombre", texto: "Falta el nombre del producto." });
  if (!ficha.composicion.trim()) avisos.push({ campo: "composicion", texto: "Falta la composición." });
  if (!ficha.descripcion.trim()) avisos.push({ campo: "descripcion", texto: "Falta la descripción." });
  if (!ficha.informacion.trim() || !ficha.indicaciones.trim()) avisos.push({ campo: "informacion", texto: "Falta información general o indicaciones de uso." });
  if (ficha.columnas.some((c) => !c.trim())) avisos.push({ campo: "columnas", texto: "La tabla de medidas tiene un encabezado vacío." });
  if (!ficha.filas.length) avisos.push({ campo: "filas", texto: "La tabla de medidas no tiene filas." });
  else if (ficha.filas.some((row) => row.every((c) => !c.trim()))) avisos.push({ campo: "filas", texto: "Hay una fila de medidas vacía." });
  if (!ficha.foto) avisos.push({ campo: "foto", texto: "Sin foto: el recuadro de presentación saldrá vacío." });
  return avisos;
}

export function fichaFileName(fichas: FichaProducto[]) {
  const clean = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").toUpperCase();
  if (fichas.length === 1) return `FICHA_TECNICA_${clean(fichas[0].nombre) || "PRODUCTO"}.docx`;
  return `FICHAS_TECNICAS_${fichas.length}_PRODUCTOS.docx`;
}

const EMU_PER_CM = 360000;

/** Tamaño de la foto en EMU: cabe en 8 × 5,6 cm sin deformarse. */
export function fotoEmu(width: number, height: number, maxWcm = 8, maxHcm = 5.6) {
  if (!(width > 0) || !(height > 0)) return { cx: Math.round(maxWcm * EMU_PER_CM), cy: Math.round(maxHcm * EMU_PER_CM) };
  const k = Math.min(maxWcm / width, maxHcm / height);
  return { cx: Math.round(width * k * EMU_PER_CM), cy: Math.round(height * k * EMU_PER_CM) };
}

/** Lee ancho y alto de un PNG (cabecera IHDR) o JPEG (marcador SOF) sin decodificarlo. */
export function imageSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) { i += 1; continue; }
      const marker = bytes[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
      }
      i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
    }
  }
  return null;
}
