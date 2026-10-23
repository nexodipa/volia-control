import assert from "node:assert/strict";
import test from "node:test";
import { alertsConfigured, sendDigest } from "../lib/alert-sender.ts";

const URL = "https://script.google.com/macros/s/AKfycbxTEST123/exec";
const fakeDb = (docs, finance) => ({
  prepare: (q) => ({ bind() { return this; }, all: async () => ({ results: q.includes("regulatory_documents") ? docs : finance }) }),
});
const NOW = new Date("2026-10-26T14:00:00Z"); // lunes en Ecuador

test("configuration needs a script.google.com exec URL and a secret", () => {
  assert.equal(alertsConfigured({ url: URL, secret: "x" }), true);
  assert.equal(alertsConfigured({ url: "https://evil.example/exec", secret: "x" }), false);
  assert.equal(alertsConfigured({ url: URL }), false);
  assert.equal(alertsConfigured(undefined), false);
});

test("sends the digest with the secret and does not send when there is nothing", async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ ok: true }), { status: 200 }); };
  try {
    const docs = [{ reference: "A-1", kind: "registro_sanitario", subject: "Guantes", expires_at: "2026-10-01" }];
    const finance = [{ data: JSON.stringify({ direction: "income", status: "pending", dueDate: "2026-10-01", counterparty: "Hospital", document: "FAC 1", subtotal: 100, iva: 15, withholding: 0 }) }, { data: "{no json" }];
    const r = await sendDigest(fakeDb(docs, finance), { url: URL, secret: "s3" }, { now: NOW });
    assert.equal(r.sent, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, URL);
    assert.equal(calls[0].body.secret, "s3");
    assert.match(calls[0].body.subject, /Informe semanal/);
    assert.match(calls[0].body.text, /registro sanitario/);
    const none = await sendDigest(fakeDb([], []), { url: URL, secret: "s3" }, { now: NOW });
    assert.equal(none.sent, false);
    assert.equal(calls.length, 1);
    const test = await sendDigest(fakeDb([], []), { url: URL, secret: "s3" }, { now: NOW, test: true });
    assert.equal(test.sent, true);
    assert.match(calls[1].body.subject, /Prueba/);
  } finally { globalThis.fetch = realFetch; }
});

test("reports a script error instead of pretending it was sent", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: "forbidden" }), { status: 200 });
  try {
    const r = await sendDigest(fakeDb([{ reference: "A", kind: "iso", subject: "", expires_at: "2026-10-01" }], []), { url: URL, secret: "bad" }, { now: NOW });
    assert.equal(r.ok, false);
    assert.match(r.message, /forbidden/);
  } finally { globalThis.fetch = realFetch; }
});
