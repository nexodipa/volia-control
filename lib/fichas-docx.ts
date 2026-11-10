"use client";

// Arma el Word de las fichas técnicas clonando la plantilla roja real (public/fichas/plantilla-rojo.docx):
// logo, líneas, tablas y pie salen de ese documento y solo se cambian los textos y la foto. Es la misma
// operación que se hizo a mano con python-docx, hecha ahora sobre el XML en el navegador.
import { FICHA_FIJOS, fichaFileName, fotoEmu, imageSize, type FichaFijos, type FichaProducto } from "./fichas";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const NS_WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const NS_PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture";
const NS_XML = "http://www.w3.org/XML/1998/namespace";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Posiciones en la plantilla: un bloque de 14 elementos por ficha (3 páginas) y el sectPr final.
const BLOCK_END = 14;
const FINAL_INDEX = 36;
const PPR_AFTER_JC = ["textDirection", "textAlignment", "textboxTightWrap", "outlineLvl", "divId", "cnfStyle", "rPr", "sectPr", "pPrChange"];

const children = (el: Element, name: string) => Array.from(el.children).filter((c) => c.localName === name && c.namespaceURI === W);
const all = (el: Element, name: string) => Array.from(el.getElementsByTagNameNS(W, name));
const make = (doc: Document, name: string) => doc.createElementNS(W, `w:${name}`);
const setVal = (el: Element, name: string, value: string) => el.setAttributeNS(W, `w:${name}`, value);

const cellText = (tc: Element) => children(tc, "p").map((p) => all(p, "t").map((t) => t.textContent ?? "").join("")).join("\n").trim();

function writeRun(doc: Document, run: Element, line: string) {
  children(run, "t").forEach((t) => run.removeChild(t));
  children(run, "br").forEach((b) => run.removeChild(b));
  const t = make(doc, "t");
  t.textContent = line;
  t.setAttributeNS(NS_XML, "xml:space", "preserve");
  run.appendChild(t);
}

// Cambia el texto de una celda conservando el formato de su primer párrafo y de su primera corrida.
// Si el texto ya es el de la plantilla no se toca (así conserva viñetas y espacios); si trae varias
// líneas, cada una queda en un párrafo propio con el formato del primero.
function setCell(doc: Document, tc: Element, text: string, model?: Element) {
  if (cellText(tc) === text.trim()) return;
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) lines.push("");
  const ps = children(tc, "p");
  const target = ps.find((p) => all(p, "t").length) ?? ps[0];
  const runs = children(target, "r").filter((r) => children(r, "t").length);
  ps.forEach((p) => { if (p !== target) tc.removeChild(p); });
  let run: Element;
  if (runs.length) {
    run = runs[0];
    runs.slice(1).forEach((r) => target.removeChild(r));
  } else {
    run = make(doc, "r");
    const modelRun = model && all(model, "r").find((r) => children(r, "t").length);
    const rPr = modelRun && children(modelRun, "rPr")[0];
    if (rPr) run.appendChild(rPr.cloneNode(true));
    target.appendChild(run);
  }
  writeRun(doc, run, lines[0]);
  let previous = target;
  lines.slice(1).forEach((line) => {
    const clone = target.cloneNode(true) as Element;
    const cloneRun = children(clone, "r").find((r) => children(r, "t").length);
    if (cloneRun) writeRun(doc, cloneRun, line);
    tc.insertBefore(clone, previous.nextSibling);
    previous = clone;
  });
}

function centerParagraph(doc: Document, p: Element) {
  let pPr = children(p, "pPr")[0];
  if (!pPr) { pPr = make(doc, "pPr"); p.insertBefore(pPr, p.firstChild); }
  children(pPr, "ind").forEach((i) => pPr.removeChild(i));
  children(pPr, "jc").forEach((j) => pPr.removeChild(j));
  const jc = make(doc, "jc");
  setVal(jc, "val", "center");
  const next = Array.from(pPr.children).find((c) => PPR_AFTER_JC.includes(c.localName));
  if (next) pPr.insertBefore(jc, next); else pPr.appendChild(jc);
}

function drawingRun(doc: Document, rid: string, id: number, cx: number, cy: number) {
  const xml = `<w:r xmlns:w="${W}" xmlns:r="${NS_R}" xmlns:wp="${NS_WP}" xmlns:a="${NS_A}" xmlns:pic="${NS_PIC}"><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Foto ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="${NS_PIC}"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="foto-${id}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  return doc.importNode(parsed.documentElement, true);
}

function forceNextPage(doc: Document, element: Element) {
  all(element, "sectPr").forEach((sect) => {
    children(sect, "type").forEach((t) => sect.removeChild(t));
    const type = make(doc, "type");
    setVal(type, "val", "nextPage");
    const refs = Array.from(sect.children).filter((c) => c.localName === "headerReference" || c.localName === "footerReference");
    const last = refs[refs.length - 1];
    if (last) sect.insertBefore(type, last.nextSibling); else sect.insertBefore(type, sect.firstChild);
  });
}

type Foto = { key: string; bytes: Uint8Array; ext: "png" | "jpeg"; rid: string; path: string };

async function loadFoto(foto: string): Promise<{ bytes: Uint8Array; ext: "png" | "jpeg" } | null> {
  if (!foto || foto === "plantilla") return null;
  try {
    if (foto.startsWith("data:")) {
      const [head, body = ""] = foto.split(",");
      const binary = atob(body);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return { bytes, ext: /jpe?g/i.test(head) ? "jpeg" : "png" };
    }
    const url = foto.startsWith("base:") ? `/fichas/fotos/${foto.slice(5)}.png` : foto;
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { bytes, ext: url.toLowerCase().endsWith(".png") ? "png" : "jpeg" };
  } catch {
    return null;
  }
}

function fillFicha(doc: Document, copy: Element[], ficha: FichaProducto, fijos: FichaFijos, foto: Foto | null | "quitar", sizeOf: (f: Foto) => { cx: number; cy: number }, drawingId: number) {
  const [t1, t2, t3] = [copy[3], copy[8], copy[11]];
  const r1 = children(t1, "tr");
  const cell = (row: Element, i = 1) => children(row, "tc")[i];
  const model = cell(r1[4]);

  setCell(doc, cell(r1[1]), ficha.nombre);
  setCell(doc, cell(r1[3]), fijos.pais);
  setCell(doc, cell(r1[4]), fijos.fabricante);
  setCell(doc, cell(r1[5]), fijos.importador);
  setCell(doc, cell(r1[6]), fijos.registro, model);
  setCell(doc, cell(r1[7]), fijos.riesgo, model);
  setCell(doc, cell(r1[8]), ficha.composicion, model);
  setCell(doc, cell(r1[9]), ficha.color, model);
  setCell(doc, cell(r1[10]), ficha.descripcion, model);

  if (foto) {
    const presentacion = r1[2];
    all(presentacion, "r").forEach((r) => {
      if (all(r, "drawing").length || all(r, "pict").length) r.parentNode?.removeChild(r);
    });
    const tc = cell(presentacion);
    children(tc, "p").forEach((p) => centerParagraph(doc, p));
    if (foto !== "quitar") {
      const { cx, cy } = sizeOf(foto);
      children(tc, "p")[0].appendChild(drawingRun(doc, foto.rid, drawingId, cx, cy));
      let trPr = children(presentacion, "trPr")[0];
      if (!trPr) { trPr = make(doc, "trPr"); presentacion.insertBefore(trPr, presentacion.firstChild); }
      children(trPr, "trHeight").forEach((h) => trPr.removeChild(h));
      const height = make(doc, "trHeight");
      setVal(height, "val", "3400");
      setVal(height, "hRule", "atLeast");
      trPr.appendChild(height);
    }
  }

  const r2 = children(t2, "tr");
  setCell(doc, cell(r2[0]), ficha.informacion, model);
  setCell(doc, cell(r2[1]), ficha.indicaciones, model);
  // Estas cuatro secciones traen un texto estándar en la plantilla; vacío = se conserva.
  if (ficha.contraindicaciones.trim()) setCell(doc, cell(r2[2]), ficha.contraindicaciones, model);
  if (ficha.efectos.trim()) setCell(doc, cell(r2[3]), ficha.efectos, model);
  if (ficha.precauciones.trim()) setCell(doc, cell(r2[4]), ficha.precauciones, model);
  if (ficha.limpieza.trim()) setCell(doc, cell(r2[5]), ficha.limpieza, model);

  const r3 = children(t3, "tr");
  children(r3[1], "tc").forEach((tc, i) => setCell(doc, tc, ficha.columnas[i] ?? "", model));
  const dataRows = r3.slice(2);
  const template = dataRows[dataRows.length - 1];
  while (dataRows.length < ficha.filas.length) {
    const clone = template.cloneNode(true) as Element;
    t3.insertBefore(clone, template.nextSibling);
    dataRows.push(clone);
  }
  dataRows.slice(ficha.filas.length).forEach((r) => t3.removeChild(r));
  ficha.filas.forEach((values, n) => children(dataRows[n], "tc").forEach((tc, i) => setCell(doc, tc, values[i] ?? "", model)));
}

export async function buildFichasDocx(fichas: FichaProducto[], fijos: FichaFijos = FICHA_FIJOS): Promise<Blob> {
  if (!fichas.length) throw new Error("Elige al menos una ficha.");
  const [{ default: JSZip }, templateResponse] = await Promise.all([import("jszip"), fetch("/fichas/plantilla-rojo.docx")]);
  if (!templateResponse.ok) throw new Error("No se pudo cargar la plantilla de fichas.");
  const zip = await JSZip.loadAsync(await templateResponse.arrayBuffer());
  const documentXml = await zip.file("word/document.xml")!.async("string");
  const doc = new DOMParser().parseFromString(documentXml, "application/xml");
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  const kids = Array.from(body.children);
  const block = kids.slice(0, BLOCK_END);
  const final = kids[FINAL_INDEX];
  if (block.length < BLOCK_END || !final || final.localName !== "sectPr") throw new Error("La plantilla de fichas no tiene la estructura esperada.");
  const sectTemplate = final.cloneNode(true) as Element;
  kids.slice(0, FINAL_INDEX).forEach((el) => body.removeChild(el));

  // Una sola copia en el paquete de cada foto distinta, aunque se use en varias fichas.
  const fotos = new Map<string, Foto | null>();
  const sizes = new Map<string, { cx: number; cy: number }>();
  const media: Array<{ path: string; bytes: Uint8Array; ext: "png" | "jpeg"; rid: string }> = [];
  for (const ficha of fichas) {
    if (fotos.has(ficha.foto) || !ficha.foto || ficha.foto === "plantilla") continue;
    const loaded = await loadFoto(ficha.foto);
    if (!loaded) { fotos.set(ficha.foto, null); continue; }
    const index = media.length + 1;
    const entry: Foto = { key: ficha.foto, bytes: loaded.bytes, ext: loaded.ext, rid: `rIdFicha${index}`, path: `media/ficha_foto_${index}.${loaded.ext}` };
    const dims = imageSize(loaded.bytes);
    sizes.set(ficha.foto, fotoEmu(dims?.width ?? 0, dims?.height ?? 0));
    media.push({ path: entry.path, bytes: loaded.bytes, ext: loaded.ext, rid: entry.rid });
    fotos.set(ficha.foto, entry);
  }

  fichas.forEach((ficha, n) => {
    const copy = block.map((el) => el.cloneNode(true) as Element);
    let foto: Foto | null | "quitar" = null;
    if (ficha.foto && ficha.foto !== "plantilla") foto = fotos.get(ficha.foto) ?? "quitar";
    else if (!ficha.foto) foto = "quitar";
    fillFicha(doc, copy, ficha, fijos, foto, (f) => sizes.get(f.key)!, 9000 + n);
    forceNextPage(doc, copy[4]);
    copy.forEach((el) => body.insertBefore(el, final));
    if (n < fichas.length - 1) {
      const p = make(doc, "p");
      const pPr = make(doc, "pPr");
      pPr.appendChild(sectTemplate.cloneNode(true));
      p.appendChild(pPr);
      body.insertBefore(p, final);
    }
  });

  zip.file("word/document.xml", new XMLSerializer().serializeToString(doc));
  if (media.length) {
    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    const added = media.map((m) => `<Relationship Id="${m.rid}" Type="${NS_R}/image" Target="${m.path}"/>`).join("");
    zip.file("word/_rels/document.xml.rels", rels.replace("</Relationships>", `${added}</Relationships>`));
    media.forEach((m) => zip.file(`word/${m.path}`, m.bytes));
  }
  return zip.generateAsync({ type: "blob", mimeType: DOCX_MIME });
}

export async function downloadFichasDocx(fichas: FichaProducto[], fijos: FichaFijos = FICHA_FIJOS) {
  const blob = await buildFichasDocx(fichas, fijos);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fichaFileName(fichas);
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
