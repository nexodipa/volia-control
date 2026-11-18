import assert from "node:assert/strict";
import test from "node:test";
import { buildDigest, ecuadorToday, isMonday } from "../lib/alert-digest.ts";

const fin = (o) => ({ direction: "income", status: "pending", dueDate: "2026-10-01", counterparty: "Hospital", document: "FAC 1", subtotal: 100, iva: 15, withholding: 1.75, ...o });
const doc = (o) => ({ reference: "1-DME-0120", kind: "Registro sanitario", subject: "Guantes", expiresAt: "2026-12-01", ...o });
const URL = "https://x.example";

test("Ecuador date uses UTC-5", () => {
  assert.equal(ecuadorToday(new Date("2026-10-24T03:00:00Z")), "2026-10-23");
  assert.equal(ecuadorToday(new Date("2026-10-24T05:00:00Z")), "2026-10-24");
  assert.equal(isMonday("2026-10-26"), true);
  assert.equal(isMonday("2026-10-23"), false);
});

test("nothing to report returns null", () => {
  assert.equal(buildDigest([doc({ expiresAt: "2030-01-01" })], [fin({ status: "paid" })], "2026-10-26", URL), null);
});

test("monday report lists everything with net totals", () => {
  const d = buildDigest([doc({ expiresAt: "2026-10-01" }), doc({ reference: "B", expiresAt: "2026-11-10" }), doc({ reference: "C", expiresAt: null })], [fin({}), fin({ direction: "expense", dueDate: "2026-10-29", counterparty: "Prodimeda" })], "2026-10-26", URL);
  assert.ok(d);
  assert.equal(d.counts.cobros, 1);
  assert.equal(d.counts.pagos, 1);
  assert.equal(d.counts.vencidos, 1);
  assert.equal(d.counts.porVencer, 1);
  assert.equal(d.counts.sinFecha, 1);
  assert.match(d.text, /USD 113,25/);
  assert.match(d.subject, /Informe semanal/);
});

test("weekday digest only reports threshold crossings", () => {
  // 2026-10-27 es martes; un documento que vence en 30 días entra, uno en 29 no
  const hit = buildDigest([doc({ expiresAt: "2026-11-26" }), doc({ reference: "B", expiresAt: "2026-11-25" })], [], "2026-10-27", URL);
  assert.ok(hit);
  assert.equal(hit.counts.porVencer, 1);
  assert.match(hit.subject, /Novedades/);
  // un cobro con 7 días de atraso entra; uno con 8 no
  assert.equal(buildDigest([], [fin({ dueDate: "2026-10-20" })], "2026-10-27", URL)?.counts.cobros, 1);
  assert.equal(buildDigest([], [fin({ dueDate: "2026-10-19" })], "2026-10-27", URL), null);
});

test("html escapes content", () => {
  const d = buildDigest([doc({ expiresAt: "2026-10-01", subject: "<b>x</b> & y" })], [], "2026-10-26", URL);
  assert.ok(d.html.includes("&lt;b&gt;x&lt;/b&gt; &amp; y"));
});

const mail = (o = {}) => ({
  id: "a:1", source: "a", receivedAt: "2026-10-26T14:00:00Z", from: { name: "Hospital", email: "c@h.ec", domain: "h.ec" },
  subject: "Cotización de guantes", category: "cotizacion", confidence: 0.8, reasons: [],
  fields: { processCodes: [], amounts: [], dates: [], deadline: "", invoices: [], rucs: [] },
  excerpt: "", attachments: [], link: "", status: "nuevo", syncedAt: "2026-10-26T15:00:00Z", ...o,
});

test("mail alone is enough for a digest and counts by category", () => {
  const d = buildDigest([], [], "2026-10-26", URL, [], [mail(), mail({ id: "a:2", category: "sercop" })]);
  assert.ok(d);
  assert.equal(d.counts.correo, 2);
  assert.match(d.text, /Correo \(2\)/);
  assert.match(d.text, /1 de Cotizaciones/);
  assert.match(d.text, /1 de Contratación pública/);
});

test("reviewed or discarded mail is not reported", () => {
  assert.equal(buildDigest([], [], "2026-10-26", URL, [], [mail({ status: "revisado" }), mail({ id: "a:2", status: "descartado" })]), null);
});

test("mail deadline is listed with days left, most urgent first", () => {
  const d = buildDigest([], [], "2026-10-26", URL, [], [
    mail({ id: "a:1", subject: "Lejano", fields: { ...mail().fields, deadline: "2026-11-02" } }),
    mail({ id: "a:2", subject: "Urgente", fields: { ...mail().fields, deadline: "2026-10-27" } }),
  ]);
  assert.ok(d);
  assert.match(d.text, /Urgente .*plazo en 1 día/);
  assert.ok(d.text.indexOf("Urgente") < d.text.indexOf("Lejano"));
});

test("weekday digest reports only mail since yesterday and deadlines at 3, 1 or 0 days", () => {
  const old = mail({ id: "a:1", syncedAt: "2026-10-20T15:00:00Z" });
  assert.equal(buildDigest([], [], "2026-10-27", URL, [], [old]), null);
  const fresh = buildDigest([], [], "2026-10-27", URL, [], [old, mail({ id: "a:2", syncedAt: "2026-10-26T20:00:00Z" })]);
  assert.equal(fresh?.counts.correo, 1);
  const at3 = (days) => mail({ id: "a:3", syncedAt: "2026-10-20T15:00:00Z", fields: { ...mail().fields, deadline: days } });
  assert.equal(buildDigest([], [], "2026-10-27", URL, [], [at3("2026-10-30")])?.counts.correo, 1);
  assert.equal(buildDigest([], [], "2026-10-27", URL, [], [at3("2026-10-29")]), null);
});

test("SERCOP mail with a process code mentions it is already in Procesos", () => {
  const d = buildDigest([], [], "2026-10-26", URL, [], [mail({ category: "sercop", fields: { ...mail().fields, processCodes: ["SIE-HE-2026-001"] } })]);
  assert.match(d.text, /ya están en Procesos/);
});

test("Lo primero: urgent items on top, only when the email has enough sections", async () => {
  const { buildDigest } = await import("../lib/alert-digest.ts");
  const today = "2026-11-23";
  const fin = (o) => ({ direction: "income", status: "pending", dueDate: "2026-10-01", counterparty: "H", document: "F1", subtotal: 100, iva: 15, withholding: 0, ...o });
  const tenders = [{ id: "t1", ref: "SIE-1", title: "x", buyer: "B", deadline: "2026-11-24", status: "preparing", notes: "", budget: 0 }];
  const records = [fin({}), fin({ direction: "expense", dueDate: "2026-11-23", document: "P1" })];
  const d = buildDigest([], records, today, "https://x.example", tenders);
  assert.ok(d);
  assert.match(d.text.split("\n\n")[1].split("\n")[0], /^Lo primero/);
  assert.match(d.text, /1 proceso\(s\) del SERCOP con fecha límite hoy o mañana: SIE-1/);
  assert.match(d.text, /1 pago\(s\) vencen hoy o ya vencieron \(USD 115,00\)/);
  assert.match(d.text, /1 cobro\(s\) con 30 días o más de mora/);
  // con solo dos secciones el bloque sobra
  const two = buildDigest([], records, today, "https://x.example");
  assert.doesNotMatch(two.text, /Lo primero/);
});

test("the subject lists at most four topics and counts the rest", async () => {
  const { buildDigest } = await import("../lib/alert-digest.ts");
  const today = "2026-11-23";
  const doc = (o) => ({ reference: "R1", kind: "registro", subject: "S (TITULAR)", expiresAt: "2026-10-01", ...o });
  const fin = (o) => ({ direction: "income", status: "pending", dueDate: "2026-10-01", counterparty: "H", document: "F1", subtotal: 100, iva: 15, withholding: 0, ...o });
  const tenders = [{ id: "t1", ref: "SIE-1", title: "x", buyer: "B", deadline: "2026-11-24", status: "preparing", notes: "", budget: 0 }];
  const stock = { items: [{ id: "i", code: "C", product: "P", lot: "L", expiry: "", stock: 0, reserved: 0, minimum: 3, unitCost: 1 }], moves: [] };
  const d = buildDigest([doc()], [fin({}), fin({ direction: "expense", dueDate: "2026-11-23" })], today, "https://x.example", tenders, [], stock);
  assert.match(d.subject, / y 1 más$/);
  assert.ok(d.subject.split(",").length <= 4);
});
