import assert from "node:assert/strict";
import test from "node:test";
import { earlyRenewals, holderOf, renewalDraft, renewalKind, renewalsDue } from "../lib/renewal-plan.ts";
import { buildDigest } from "../lib/alert-digest.ts";
import { REGULATORY_SEED } from "../lib/regulatory-data.ts";

const doc = (o) => ({ reference: "12578-DME-0122", kind: "Registro sanitario", subject: "Jeringas hipodérmicas Andino (Prodimeda)", items: "21, 22", expiresAt: "2027-01-04", ...o });
const URL = "https://x.example";

test("kind is recognised from screen and database spellings", () => {
  assert.equal(renewalKind("Registro sanitario"), "registro");
  assert.equal(renewalKind("registro sanitario"), "registro");
  assert.equal(renewalKind("registro_sanitario"), "registro");
  assert.equal(renewalKind("Notificación sanitaria"), "notificacion");
  assert.equal(renewalKind("notificacion sanitaria"), "notificacion");
  assert.equal(renewalKind("iso"), "iso");
  assert.equal(renewalKind("Autorización de distribuidor"), "autorizacion");
  assert.equal(renewalKind("otra cosa"), "otro");
});

test("holder comes from the parentheses or the authorization issuer", () => {
  assert.equal(holderOf(doc()), "Prodimeda");
  assert.equal(holderOf(doc({ subject: "Botas (Dhisve, no estériles)" })), "Dhisve");
  assert.equal(holderOf(doc({ kind: "Autorización de distribuidor", reference: "BIO-IN S.A. a Volia", subject: "Distribución" })), "BIO-IN S.A.");
  assert.equal(holderOf(doc({ kind: "Autorización de distribuidor", reference: "Nipro, certificado No. 0034" })), "Nipro");
  assert.equal(holderOf(doc({ kind: "ISO", subject: "Certificado de calidad" })), "");
  const named = REGULATORY_SEED.filter((r) => holderOf(r));
  assert.ok(named.length >= 8, `solo ${named.length} con titular`);
});

test("each kind enters its own management window", () => {
  const today = "2026-11-18";
  const reg = (d) => doc({ expiresAt: d });
  assert.equal(renewalsDue([reg("2027-05-17")], today).length, 1); // 180 días
  assert.equal(renewalsDue([reg("2027-05-18")], today).length, 0); // 181
  assert.equal(renewalsDue([doc({ kind: "ISO", expiresAt: "2027-03-18" })], today).length, 1); // 120
  assert.equal(renewalsDue([doc({ kind: "ISO", expiresAt: "2027-03-19" })], today).length, 0);
  assert.equal(renewalsDue([doc({ kind: "Autorización de distribuidor", expiresAt: "2027-01-17" })], today).length, 1); // 60
  assert.equal(renewalsDue([doc({ expiresAt: null })], today).length, 0);
});

test("stages: iniciar, urgente, vencido; most urgent first", () => {
  const r = renewalsDue([doc({ reference: "A", expiresAt: "2027-04-01" }), doc({ reference: "B", expiresAt: "2026-12-01" }), doc({ reference: "C", expiresAt: "2026-11-01" })], "2026-11-18");
  assert.deepEqual(r.map((x) => [x.doc.reference, x.stage]), [["C", "vencido"], ["B", "urgente"], ["A", "iniciar"]]);
});

test("early renewals skip what the 90-day section already covers and respect weekday marks", () => {
  const docs = [doc({ reference: "A", expiresAt: "2027-02-15" }), doc({ reference: "B", expiresAt: "2026-12-30" })]; // 89 y 42 días desde 2026-11-18
  assert.equal(earlyRenewals(docs, "2026-11-18", true).length, 0);
  const far = doc({ reference: "F", expiresAt: "2027-04-01" }); // 134 días
  assert.equal(earlyRenewals([far], "2026-11-18", true).length, 1);
  assert.equal(earlyRenewals([far], "2026-11-18", false).length, 0);
  assert.equal(earlyRenewals([doc({ expiresAt: "2027-03-18" })], "2026-11-18", false).length, 1); // 120 días
  assert.equal(earlyRenewals([doc({ expiresAt: "2027-05-17" })], "2026-11-18", false).length, 1); // 180 días: entra hoy
});

test("draft addresses the holder, names the document and never invents numbers", () => {
  const d = renewalDraft(doc({ expiresAt: "2027-01-04" }), "2026-11-18");
  assert.equal(d.holder, "Prodimeda");
  assert.match(d.subject, /Renovación: registro sanitario 12578-DME-0122/);
  assert.match(d.body, /Estimados señores de Prodimeda/);
  assert.match(d.body, /vence el 4 de enero del 2027/);
  assert.match(d.body, /ítems 21, 22/);
  assert.match(d.body, /hasta el 25 de noviembre del 2026/);
  assert.match(d.body, /1\. La constancia/);
  assert.match(d.body, /2\. La carta de autorización/);
  assert.match(d.body, /Volia S\.A\.S\.$/);
});

test("draft for an expired ISO without holder leaves a placeholder and asks right away", () => {
  const d = renewalDraft(doc({ kind: "ISO", reference: "ISO 9001", subject: "Certificado de calidad", items: "Varios", expiresAt: "2026-08-07" }), "2026-11-18");
  assert.match(d.subject, /^Documento vencido: certificado ISO 9001$/);
  assert.match(d.body, /\[titular del documento\]/);
  assert.match(d.body, /venció el 7 de agosto del 2026/);
  assert.match(d.body, /a la brevedad posible/);
  assert.doesNotMatch(d.body, /Respalda los ítems/);
});

test("digest: early renewals appear on Monday with the holder, weekday only on marks", () => {
  const far = doc({ expiresAt: "2027-04-01" }); // 134 días desde 2026-11-18
  const mon = buildDigest([far], [], "2026-11-23", URL); // lunes, 129 días
  assert.ok(mon);
  assert.equal(mon.counts.renovaciones, 1);
  assert.match(mon.text, /Renovaciones por iniciar \(1\)/);
  assert.match(mon.text, /pedir a Prodimeda/);
  assert.equal(buildDigest([far], [], "2026-11-24", URL), null); // martes sin marca
  assert.equal(buildDigest([doc({ expiresAt: "2027-03-23" })], [], "2026-11-23", URL)?.counts.renovaciones, 1);
});

test("digest: documents under 90 days also say whom to ask", () => {
  const d = buildDigest([doc({ expiresAt: "2027-01-04" })], [], "2026-11-23", URL);
  assert.match(d.text, /por vencer/);
  assert.match(d.text, /pedir a Prodimeda/);
  assert.equal(d.counts.renovaciones, 0);
});
