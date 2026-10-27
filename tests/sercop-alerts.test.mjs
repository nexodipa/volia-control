import assert from "node:assert/strict";
import test from "node:test";
import { isMedical, isRecent, parsePage, collectCandidates, runSercopCheck, buildSercopDigest } from "../lib/sercop-alerts.ts";

const row = (o) => ({ id: 1, ocid: "ocds-x-" + (o.id ?? 1), year: 2026, month: 10, internal_type: "Subasta Inversa Electrónica", region: "PICHINCHA", locality: "QUITO", buyer: "HOSPITAL X", amount: "1000", date: "2026-11-01T00:00:00-05:00", title: "SIE-1", description: "", budget: null, ...o });

test("clasifica lo médico y descarta el ruido", () => {
  assert.equal(isMedical(row({ description: "ADQUISICIÓN DE MATERIAL DE OSTEOSÍNTESIS PARA TRAUMATOLOGÍA" })), true);
  assert.equal(isMedical(row({ buyer: "HOSPITAL SAN LUIS", description: "ADQUISICION DE INSUMOS Y REACTIVOS PARA EL LABORATORIO CLINICO" })), true);
  assert.equal(isMedical(row({ buyer: "GAD MUNICIPAL", description: "ADQUISICIÓN DE INSUMOS QUÍMICOS PARA EL TRATAMIENTO DEL AGUA POTABLE" })), false);
  assert.equal(isMedical(row({ buyer: "HOSPITAL B", description: "SERVICIO DE LIMPIEZA HOSPITALARIA, INCLUYE MATERIALES E INSUMOS PARA ASEO" })), false);
  assert.equal(isMedical(row({ title: null, description: null })), false);
});
test("solo avisa de lo publicado este mes o el anterior", () => {
  assert.equal(isRecent({ year: 2026, month: 10 }, "2026-10-27"), true);
  assert.equal(isRecent({ year: 2026, month: 9 }, "2026-10-27"), true);
  assert.equal(isRecent({ year: 2026, month: 2 }, "2026-10-27"), false);
  assert.equal(isRecent({ year: 2025, month: 12 }, "2026-01-05"), false);
});
test("parsePage tolera respuestas raras", () => {
  assert.deepEqual(parsePage(null), { rows: [], pages: 1 });
  assert.equal(parsePage({ pages: 3, data: [{ ocid: "a" }, { x: 1 }] }).rows.length, 1);
});

function fakeWorld(pagesByTerm) {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    const u = new URL(url); const term = u.searchParams.get("search"); const page = Number(u.searchParams.get("page"));
    const set = pagesByTerm[term]; if (!set) return { ok: true, status: 200, json: async () => ({ pages: 1, data: [] }) };
    return { ok: true, status: 200, json: async () => ({ pages: set.length, data: set[page - 1] ?? [] }) };
  };
  return { fetcher, calls };
}
function fakeDb() {
  const seen = new Set(); let batches = 0;
  return { seen, get batches() { return batches; }, prepare(q) { const st = { q, args: [], bind(...a) { st.args = a; return st; }, async all() { return { results: [...seen].map((record_id) => ({ record_id })) }; } }; return st; }, async batch(sts) { batches += 1; for (const s of sts) seen.add(s.args[1]); } };
}
const cfg = { url: "https://script.google.com/macros/s/ABC123/exec", secret: "s" };

test("primera revisión envía y marca; la segunda no repite; los nuevos sí llegan", async () => {
  const world = fakeWorld({ osteosíntesis: [[row({ id: 1, description: "material de osteosíntesis" }), row({ id: 2, description: "tornillos para traumatología" })]] });
  const db = fakeDb(); const sent = [];
  globalThis.fetch = async (url, init) => { sent.push(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  const now = new Date("2026-10-27T15:00:00Z");
  const r1 = await runSercopCheck(db, cfg, { fetcher: world.fetcher, now });
  assert.equal(r1.sent, true); assert.equal(r1.fresh, 2); assert.match(sent[0].subject, /para revisar/);
  const r2 = await runSercopCheck(db, cfg, { fetcher: world.fetcher, now });
  assert.equal(r2.sent, false); assert.equal(r2.fresh, 0);
  world.fetcher = fakeWorld({ osteosíntesis: [[row({ id: 3, description: "implante de cadera" })]] }).fetcher;
  const r3 = await runSercopCheck(db, cfg, { fetcher: world.fetcher, now });
  assert.equal(r3.sent, true); assert.equal(r3.fresh, 1); assert.match(sent[1].subject, /nuevo/);
});
test("si el correo falla no se marcan como vistos", async () => {
  const world = fakeWorld({ implantes: [[row({ id: 9, description: "implantes ortopédicos" })]] });
  const db = fakeDb();
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const r = await runSercopCheck(db, cfg, { fetcher: world.fetcher, now: new Date("2026-10-27T15:00:00Z") });
  assert.equal(r.ok, false); assert.equal(db.seen.size, 0);
});
test("la prueba sin enviar no toca nada y respeta el presupuesto de consultas", async () => {
  const many = Array.from({ length: 60 }, () => [row({ id: 5, description: "material quirúrgico" })]);
  const world = fakeWorld(Object.fromEntries(["dispositivos médicos", "insumos médicos", "implantes", "traumatología"].map((t) => [t, many])));
  const out = await collectCandidates(world.fetcher, 2026, "2026-10-27");
  assert.ok(world.calls.length <= 36 && world.calls.length >= 11); assert.equal(out.truncated, true);
  const db = fakeDb(); const r = await runSercopCheck(db, cfg, { fetcher: world.fetcher, now: new Date("2026-10-27T15:00:00Z"), dryRun: true });
  assert.equal(r.sent, false); assert.equal(db.seen.size, 0);
});
test("si el SERCOP no responde, lo dice sin marcar nada", async () => {
  const bad = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const r = await runSercopCheck(fakeDb(), cfg, { fetcher: bad, now: new Date("2026-10-27T15:00:00Z") });
  assert.equal(r.ok, false); assert.match(r.message, /No se pudo consultar/);
});
test("el correo corta en 40 y avisa", () => {
  const rows = Array.from({ length: 45 }, (_, i) => row({ id: i, title: `P${i}`, description: "material" }));
  const d = buildSercopDigest(rows, "2026-10-27", false, true);
  assert.match(d.text, /Se muestran 40 de 45/); assert.match(d.text, /se cortó/);
});

import { runAndRecordSercop, readLastSercop } from "../lib/sercop-alerts.ts";
test("anota el último resultado y lo devuelve", async () => {
  const store = new Map();
  const db = { prepare(q) { const st = { q, args: [], bind(...a) { st.args = a; return st; }, async all() { if (/sercop_meta/.test(q)) return { results: store.has("last") ? [{ data: store.get("last") }] : [] }; return { results: [] }; } }; return st; }, async batch(sts) { for (const s of sts) if (/sercop_meta/.test(s.q)) store.set("last", s.args[0]); } };
  const bad = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const r = await runAndRecordSercop(db, cfg, { fetcher: bad, now: new Date("2026-10-27T15:00:00Z") });
  assert.equal(r.ok, false);
  const last = await readLastSercop(db);
  assert.equal(last.ok, false); assert.match(last.message, /No se pudo consultar/);
});
