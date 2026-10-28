import assert from "node:assert/strict";
import test from "node:test";
import { BAD_KEY_MESSAGE, bytesToBase64, decryptJson, encryptJson } from "../lib/backup-crypto.ts";

const FAST = { iterations: 1000 }; // en producción son 600 000; aquí basta para probar el formato
const KEY = "una-clave-larga-de-prueba";
const isObj = (v) => !!v && typeof v === "object";

// Datos con el volumen y la repetición de un año de uso: cotizaciones, finanzas, movimientos, actividad.
const bigData = () => {
  const row = (i) => ({ id: `r-${i}`, counterparty: `Hospital General Número ${i % 40}`, document: `FAC-${100000 + i}`, subtotal: 1234.56 + i, iva: 185.18, withholding: 12.34, dueDate: "2026-10-30", status: i % 3 ? "paid" : "pending", notes: "Pago a 60 días por convenio marco, retención 2%" });
  return { finance: JSON.stringify(Array.from({ length: 3400 }, (_, i) => row(i))), activity: JSON.stringify(Array.from({ length: 2000 }, (_, i) => ({ id: `${i}`, timestamp: "2026-10-27T10:00:00-05:00", module: "Finanzas", action: "Registro actualizado", detail: `FAC-${i}` }))) };
};

test("cifra, descifra y devuelve exactamente lo mismo (con acentos y emojis)", async () => {
  const original = { product: "Volia Control", version: 3, data: { a: "Cirugía de cadera — niño ñandú 🦴", b: JSON.stringify([1, 2, 3]) } };
  const payload = await encryptJson(original, KEY, FAST);
  assert.deepEqual(await decryptJson(payload, KEY, isObj, FAST), original);
});

test("clave equivocada, copia alterada y copia truncada dan el mismo aviso y no devuelven datos", async () => {
  const payload = await encryptJson({ x: 1 }, KEY, FAST);
  await assert.rejects(() => decryptJson(payload, "otra-clave-bien-larga", isObj, FAST), { message: BAD_KEY_MESSAGE });
  const bytes = Uint8Array.from(atob(payload), (c) => c.charCodeAt(0)); bytes[bytes.length - 3] ^= 0xff;
  await assert.rejects(() => decryptJson(bytesToBase64(bytes), KEY, isObj, FAST), { message: BAD_KEY_MESSAGE });
  await assert.rejects(() => decryptJson(payload.slice(0, 30), KEY, isObj, FAST), { message: BAD_KEY_MESSAGE });
  await assert.rejects(() => decryptJson("no es base64 !!!", KEY, isObj, FAST), { message: BAD_KEY_MESSAGE });
});

test("rechaza claves cortas antes de tocar nada", async () => {
  await assert.rejects(() => encryptJson({}, "corta", FAST), /al menos 12/);
  await assert.rejects(() => decryptJson("AAAA", "corta", isObj, FAST), /al menos 12/);
});

test("un contenido que no es una copia de Volia se rechaza aunque la clave sea correcta", async () => {
  const payload = await encryptJson({ otra: "cosa" }, KEY, FAST);
  await assert.rejects(() => decryptJson(payload, KEY, (v) => isObj(v) && v.product === "Volia Control", FAST), { message: BAD_KEY_MESSAGE });
});

test("las copias sin comprimir (formato anterior) se siguen abriendo", async () => {
  const old = await encryptJson({ product: "Volia Control", n: 7 }, KEY, { ...FAST, compress: false });
  assert.deepEqual(await decryptJson(old, KEY, isObj, FAST), { product: "Volia Control", n: 7 });
});

test("comprimir reduce mucho el tamaño y deja margen bajo el tope de 1,5 millones de caracteres del servidor", async () => {
  const envelope = { product: "Volia Control", version: 3, data: bigData() };
  const plain = await encryptJson(envelope, KEY, { ...FAST, compress: false });
  const packed = await encryptJson(envelope, KEY, FAST);
  console.log(`   sin comprimir: ${plain.length.toLocaleString("es-EC")} car. · comprimido: ${packed.length.toLocaleString("es-EC")} car. (tope 1 500 000)`);
  assert.ok(plain.length > 1_500_000, "con este volumen la copia sin comprimir ya NO cabría");
  assert.ok(packed.length < 1_500_000 * 0.5, "comprimida cabe con holgura");
  assert.deepEqual(await decryptJson(packed, KEY, isObj, FAST), envelope);
});

test("si comprimir no ayuda, se guarda tal cual y también se recupera", async () => {
  const noise = Array.from(crypto.getRandomValues(new Uint8Array(3000)), (b) => b.toString(16).padStart(2, "0")).join("");
  const value = { product: "Volia Control", noise };
  assert.deepEqual(await decryptJson(await encryptJson(value, KEY, FAST), KEY, isObj, FAST), value);
});
