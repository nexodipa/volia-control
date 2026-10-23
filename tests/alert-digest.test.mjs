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
