import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { classifyMail, cleanBody, extractRequestedItems, extractFields, parseAmount, parseSender, redact } from "../lib/mail-triage.ts";

const M = (o) => ({ from: "x@y.com", subject: "", body: "", ...o });

test("process codes: all 1229 real SERCOP ids are recognised whole", () => {
  const ids = JSON.parse(fs.readFileSync(new URL("../public/data/mercado-sercop-2026.json", import.meta.url), "utf8")).processes.map((p) => p.id);
  assert.ok(ids.length > 1000);
  const bad = ids.filter((id) => { const got = extractFields(`Proceso ${id}, plazo hasta el 20/11/2026`).processCodes; return got.length !== 1 || got[0] !== id; });
  assert.deepEqual(bad, []);
});

test("process codes: ordinary words and invoice numbers are not taken for codes", () => {
  const f = extractFields("Factura 001-002-000001234 del año 2026-05, RE: pedido SI-NO");
  assert.deepEqual(f.processCodes, []);
  assert.deepEqual(f.invoices, ["001-002-000001234"]);
});

test("amounts: Ecuadorian and US formats", () => {
  assert.equal(parseAmount("1.234,56"), 1234.56);
  assert.equal(parseAmount("1,234.56"), 1234.56);
  assert.equal(parseAmount("1234,5"), 1234.5);
  assert.equal(parseAmount("12.500"), 12500);
  assert.equal(parseAmount("85.20"), 85.2);
  assert.deepEqual(extractFields("Total $ 1.234,56 y USD 85.20").amounts.sort((a, b) => a - b), [85.2, 1234.56]);
});

test("dates: numeric, long and ISO forms; deadline picks the one after a keyword", () => {
  const f = extractFields("Recibido el 10/11/2026. Plazo para presentar la oferta: hasta el 15 de noviembre de 2026. Audiencia 2026-12-01.");
  assert.deepEqual(f.dates, ["2026-11-10", "2026-11-15", "2026-12-01"]);
  assert.equal(f.deadline, "2026-11-15");
  assert.equal(extractFields("fecha 31/02/2026").dates.length, 0);
});

test("RUC and sender parsing", () => {
  assert.deepEqual(extractFields("RUC 1791234567001 y cédula 1712345678").rucs, ["1791234567001"]);
  assert.deepEqual(parseSender('"Hospital Vozandes" <compras@hvozandes.com>'), { name: "Hospital Vozandes", email: "compras@hvozandes.com", domain: "hvozandes.com" });
});

test("redaction: card numbers and passwords are masked, RUC is kept", () => {
  const r = redact("Tarjeta 4111 1111 1111 1111, clave: Secreta123, contraseña es abc, RUC 1791234567001, tel 0991234567");
  assert.ok(!r.includes("4111"));
  assert.ok(!r.includes("Secreta123"));
  assert.ok(r.includes("1791234567001"));
  assert.ok(r.includes("0991234567"));
});

test("cleanBody drops quoted replies and original-message blocks", () => {
  const b = cleanBody("Gracias, adjunto la oferta.\n> texto citado\n\nEl lun, 3 nov 2026 escribió:\nvieja conversación con $999");
  assert.equal(b, "Gracias, adjunto la oferta.");
});

test("category: SERCOP notification with process code", () => {
  const t = classifyMail(M({ from: "Notificaciones <no-reply@compraspublicas.gob.ec>", subject: "Invitación a participar: SIE-HEEE-2026-049-52558", body: "Se ha publicado la convocatoria. Presente su oferta hasta el 20/11/2026." }));
  assert.equal(t.category, "sercop");
  assert.deepEqual(t.fields.processCodes, ["SIE-HEEE-2026-049-52558"]);
  assert.equal(t.fields.deadline, "2026-11-20");
  assert.ok(t.confidence > 0.5);
});

test("category: quotation request", () => {
  const t = classifyMail(M({ from: "compras@clinicaxyz.com", subject: "Solicitud de cotización - insumos", body: "Buenos días, necesitamos cotizar 200 hojas de bisturí y 50 cajas de guantes. Agradecemos precio unitario y disponibilidad." }));
  assert.equal(t.category, "cotizacion");
});

test("category: purchase order and invoice", () => {
  assert.equal(classifyMail(M({ subject: "Orden de compra OC-2231", body: "Adjuntamos la orden de compra. Fecha de entrega: 25/11/2026." })).category, "pedido");
  const f = classifyMail(M({ subject: "Factura 001-002-000004521 vencida", body: "Le recordamos el saldo pendiente de $ 1.250,00. Realice la transferencia." }));
  assert.equal(f.category, "cobro_pago");
  assert.deepEqual(f.fields.invoices, ["001-002-000004521"]);
  assert.deepEqual(f.fields.amounts, [1250]);
});

test("category: ARCSA beats generic words, and unclear mail goes to otros", () => {
  assert.equal(classifyMail(M({ from: "info@controlsanitario.gob.ec", subject: "Renovación de notificación sanitaria", body: "Su registro sanitario vence el 30/12/2026." })).category, "regulatorio");
  const o = classifyMail(M({ subject: "Saludos", body: "Hola, ¿cómo estás? Nos vemos pronto." }));
  assert.equal(o.category, "otro");
  assert.equal(o.confidence, 0);
});

test("attachments help to decide, and the excerpt is redacted and short", () => {
  const t = classifyMail(M({ subject: "Documentos", body: "Va lo acordado. clave: Xyz9999 " + "relleno ".repeat(200), attachments: [{ name: "Lista de precios noviembre.xlsx" }] }));
  assert.equal(t.category, "proveedor");
  assert.ok(t.excerpt.length <= 600);
  assert.ok(!t.excerpt.includes("Xyz9999"));
});

test("items: inline, bulleted and trailing-quantity lines; dates, plazos and sizes are not items", () => {
  assert.deepEqual(extractRequestedItems("Necesitamos cotizar 200 hojas de bisturí y 50 cajas de guantes. Gracias."), [{ text: "hojas de bisturí", quantity: 200 }, { text: "guantes", quantity: 50 }]);
  assert.deepEqual(extractRequestedItems("Favor cotizar:\n- 10 jeringas 10 ml\n- Guantes de examen talla M x 50\n3) Catéter de succión 08 CH - 20 unidades"), [{ text: "jeringas 10 ml", quantity: 10 }, { text: "Guantes de examen talla M", quantity: 50 }, { text: "Catéter de succión 08 CH", quantity: 20 }]);
  assert.deepEqual(extractRequestedItems("5 de noviembre es el cierre\nEl plazo es de 10 días\n15 días de plazo"), []);
  assert.deepEqual(extractRequestedItems("Aguja hipodérmica 21-23"), []);
  assert.deepEqual(extractRequestedItems("Solicito 25 unidades de sutura vicryl 2-0, 12 cajas de gasas estériles y 3 trocares 12mm").map((i) => i.quantity), [25, 12, 3]);
});

test("items: only quotations and orders carry them", () => {
  const q = classifyMail(M({ subject: "Solicitud de cotización", body: "Favor cotizar:\n- 10 jeringas 10 ml\n- 5 equipos de venoclisis" }));
  assert.equal(q.category, "cotizacion");
  assert.equal(q.items.length, 2);
  const other = classifyMail(M({ from: "no-reply@compraspublicas.gob.ec", subject: "Invitación SIE-HEEE-2026-049-52558", body: "- 10 jeringas 10 ml" }));
  assert.deepEqual(other.items, []);
});
