import assert from "node:assert/strict";
import test from "node:test";
import { FICHA_FIJOS, fichaAvisos, fichaFileName, fotoEmu, imageSize, mergeFichas, normalizeFicha, slugId } from "../lib/fichas.ts";
import { FICHAS_BASE } from "../lib/fichas-data.ts";

test("los cinco datos fijos del encabezado son los de Osteotech", () => {
  assert.deepEqual(FICHA_FIJOS, {
    pais: "China",
    fabricante: "MINDRAY SCIENTIFIC Co., Ltda.",
    importador: "OSTEOTECH Implantes Quirúrgicos S.A.S",
    registro: "INVIMA 2016DM-0015022",
    riesgo: "III",
  });
});

test("las ocho fichas base están completas y sin avisos", () => {
  assert.equal(FICHAS_BASE.length, 8);
  assert.equal(new Set(FICHAS_BASE.map((f) => f.id)).size, 8);
  for (const f of FICHAS_BASE) {
    assert.equal(f.columnas.length, 3, f.id);
    assert.ok(f.filas.length > 0 && f.filas.every((r) => r.length === 3), f.id);
    assert.deepEqual(fichaAvisos(f), [], f.id);
  }
  assert.equal(FICHAS_BASE[0].foto, "plantilla");
  assert.ok(FICHAS_BASE.slice(1).every((f) => /^base:0[2-8]$/.test(f.foto)));
});

test("la ficha del vástago no cementado trae las tallas 6 a 15 con cono 10/14", () => {
  const f = FICHAS_BASE.find((x) => x.id === "vastago-no-cementado");
  assert.deepEqual(f.filas.map((r) => r[0]), ["6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]);
  assert.ok(f.filas.every((r) => r[1] === "10/14"));
});

test("normalizeFicha completa lo que falte y recorta lo que sobre", () => {
  const f = normalizeFicha({ nombre: "X", columnas: ["A"], filas: [["1"], ["1", "2", "3", "4"], "mal"], foto: 5 }, "ficha-9");
  assert.equal(f.id, "ficha-9");
  assert.deepEqual(f.columnas, ["A", "", ""]);
  assert.deepEqual(f.filas, [["1", "", ""], ["1", "2", "3"], ["", "", ""]]);
  assert.equal(f.foto, "");
});

test("mergeFichas conserva los cambios del usuario, repone lo base que falte y mantiene las fichas propias", () => {
  const editada = { ...FICHAS_BASE[1], nombre: "VÁSTAGO EDITADO" };
  const propia = { ...FICHAS_BASE[2], id: "mia", nombre: "MI FICHA" };
  const merged = mergeFichas(FICHAS_BASE, { fichas: [editada, propia], seleccion: ["mia", "no-existe"], fijos: { registro: "INVIMA 2020DM-0000001" } });
  assert.equal(merged.fichas.length, 9);
  assert.equal(merged.fichas[1].nombre, "VÁSTAGO EDITADO");
  assert.equal(merged.fichas[0].id, "cabeza-bipolar");
  assert.equal(merged.fichas[8].id, "mia");
  assert.deepEqual(merged.seleccion, ["mia"]);
  assert.equal(merged.fijos.registro, "INVIMA 2020DM-0000001");
  assert.equal(merged.fijos.pais, "China");
});

test("mergeFichas sin nada guardado devuelve las base, todas marcadas", () => {
  for (const saved of [undefined, null, {}, "texto", { fichas: "no" }]) {
    const merged = mergeFichas(FICHAS_BASE, saved);
    assert.equal(merged.fichas.length, 8);
    assert.equal(merged.seleccion.length, 8);
    assert.deepEqual(merged.fijos, FICHA_FIJOS);
  }
});

test("fichaAvisos señala lo que falta sin inventar nada", () => {
  const vacia = normalizeFicha({}, "x");
  const campos = fichaAvisos(vacia).map((a) => a.campo);
  for (const c of ["nombre", "composicion", "descripcion", "informacion", "columnas", "filas", "foto"]) assert.ok(campos.includes(c), c);
  const conFilaVacia = { ...FICHAS_BASE[1], filas: [["", "", ""]] };
  assert.ok(fichaAvisos(conFilaVacia).some((a) => a.campo === "filas"));
});

test("slugId no repite identificadores", () => {
  assert.equal(slugId("Vástago largo", []), "vastago-largo");
  assert.equal(slugId("Vástago largo", ["vastago-largo"]), "vastago-largo-2");
  assert.equal(slugId("Vástago largo", ["vastago-largo", "vastago-largo-2"]), "vastago-largo-3");
  assert.equal(slugId("¡¡", []), "ficha");
});

test("fichaFileName: una ficha lleva su nombre y varias van juntas", () => {
  assert.equal(fichaFileName([{ nombre: "CABEZA BIPOLAR" }]), "FICHA_TECNICA_CABEZA_BIPOLAR.docx");
  assert.equal(fichaFileName([{ nombre: "VÁSTAGO" }]), "FICHA_TECNICA_VASTAGO.docx");
  assert.equal(fichaFileName([{ nombre: "A" }, { nombre: "B" }]), "FICHAS_TECNICAS_2_PRODUCTOS.docx");
});

test("fotoEmu cabe en 8 × 5,6 cm sin deformar la foto", () => {
  const ancha = fotoEmu(1600, 400);
  assert.equal(ancha.cx, 8 * 360000);
  assert.equal(ancha.cy, 2 * 360000);
  const alta = fotoEmu(400, 1600);
  assert.equal(alta.cy, Math.round(5.6 * 360000));
  assert.ok(Math.abs(alta.cx / alta.cy - 0.25) < 0.001);
  assert.deepEqual(fotoEmu(0, 0), { cx: 8 * 360000, cy: Math.round(5.6 * 360000) });
});

test("imageSize lee el tamaño de PNG y JPEG sin decodificarlos", () => {
  const png = new Uint8Array(33);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  new DataView(png.buffer).setUint32(16, 640);
  new DataView(png.buffer).setUint32(20, 480);
  assert.deepEqual(imageSize(png), { width: 640, height: 480 });
  const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(imageSize(jpg), { width: 640, height: 480 });
  assert.equal(imageSize(Uint8Array.from([1, 2, 3])), null);
});
