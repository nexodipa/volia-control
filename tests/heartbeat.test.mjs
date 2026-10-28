import assert from "node:assert/strict";
import test from "node:test";
import { healthcheckUrl, missedRuns, needsRetry, pingHealthcheck, readMeta, runAndRecordDigest, runHealth, saveMeta } from "../lib/heartbeat.ts";

const META_DB = () => {
  const store = new Map();
  const db = {
    store,
    prepare(q) {
      const st = { q, args: [], bind(...a) { st.args = a; return st; }, async all() {
        if (q.includes("regulatory_documents") || q.includes("'finance'")) return { results: [] };
        const k = st.args[1]; return { results: store.has(k) ? [{ data: store.get(k) }] : [] };
      } };
      return st;
    },
    async batch(sts) { for (const s of sts) store.set(s.args[1], s.args[2]); },
  };
  return db;
};

test("cuenta solo las ejecuciones de lunes a viernes ya vencidas", () => {
  const monRun = "2026-10-26T13:00:05Z";
  assert.equal(missedRuns(monRun, new Date("2026-10-27T13:10:00Z")), 0, "dentro de la gracia");
  assert.equal(missedRuns(monRun, new Date("2026-10-27T13:40:00Z")), 1);
  assert.equal(missedRuns("2026-10-30T13:00:05Z", new Date("2026-11-02T13:40:00Z")), 1, "salta sábado y domingo");
  assert.equal(missedRuns("2026-10-30T13:00:05Z", new Date("2026-11-03T14:00:00Z")), 2);
  assert.equal(missedRuns("2026-10-30T13:00:05Z", new Date("2026-10-31T20:00:00Z")), 0, "el fin de semana no cuenta");
  assert.equal(missedRuns(null, new Date()), 0);
  assert.equal(missedRuns("basura", new Date()), 0);
});

test("salud: ok, late y down", () => {
  const good = { at: "2026-10-27T13:00:05Z", ok: true, sent: false, message: "" };
  assert.equal(runHealth(null), "unknown");
  assert.equal(runHealth(good, new Date("2026-10-27T18:00:00Z")), "ok");
  assert.equal(runHealth({ ...good, ok: false }, new Date("2026-10-27T14:00:00Z")), "late");
  assert.equal(runHealth(good, new Date("2026-10-28T13:40:00Z")), "late");
  assert.equal(runHealth(good, new Date("2026-10-29T13:40:00Z")), "down");
});

test("reintento por la tarde solo si hoy no corrió o salió mal", () => {
  const today = "2026-10-27";
  assert.equal(needsRetry(null, today), true);
  assert.equal(needsRetry({ at: "2026-10-27T13:00:05Z", ok: true }, today), false);
  assert.equal(needsRetry({ at: "2026-10-27T13:00:05Z", ok: false }, today), true);
  assert.equal(needsRetry({ at: "2026-10-26T13:00:05Z", ok: true }, today), true);
  // 03:00 UTC del 28 sigue siendo 27 en Ecuador
  assert.equal(needsRetry({ at: "2026-10-28T03:00:00Z", ok: true }, today), false);
});

test("la URL del vigilante debe ser https y sin parámetros", () => {
  assert.equal(healthcheckUrl("https://hc-ping.com/abc-123/"), "https://hc-ping.com/abc-123");
  assert.equal(healthcheckUrl("http://hc-ping.com/abc"), null);
  assert.equal(healthcheckUrl("https://hc-ping.com/abc?x=1"), null);
  assert.equal(healthcheckUrl(undefined), null);
  assert.equal(healthcheckUrl("  "), null);
});

test("el aviso al vigilante usa /fail en error y nunca lanza", async () => {
  const urls = [];
  const okFetch = async (u) => { urls.push(u); return { ok: true }; };
  assert.equal(await pingHealthcheck("https://hc-ping.com/abc", true, okFetch), true);
  assert.equal(await pingHealthcheck("https://hc-ping.com/abc", false, okFetch), true);
  assert.deepEqual(urls, ["https://hc-ping.com/abc", "https://hc-ping.com/abc/fail"]);
  assert.equal(await pingHealthcheck("https://hc-ping.com/abc", true, async () => { throw new Error("red"); }), false);
  assert.equal(await pingHealthcheck(undefined, true, okFetch), false);
  assert.equal(urls.length, 2);
});

test("el resultado del resumen queda anotado; la prueba manual no", async () => {
  const db = META_DB();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
  try {
    const cfg = { url: "https://script.google.com/macros/s/ABC123/exec", secret: "s" };
    const now = new Date("2026-10-27T13:00:05Z");
    await runAndRecordDigest(db, cfg, { now, test: true });
    assert.equal(await readMeta(db, "digest"), null);
    const r = await runAndRecordDigest(db, cfg, { now });
    assert.equal(r.ok, true);
    const meta = await readMeta(db, "digest");
    assert.equal(meta.ok, true); assert.equal(meta.at, now.toISOString());
    const bad = await runAndRecordDigest(db, undefined, { now });
    assert.equal(bad.ok, false);
    assert.equal((await readMeta(db, "digest")).ok, false);
  } finally { globalThis.fetch = realFetch; }
});

test("saveMeta tolera una base que falla", async () => {
  await saveMeta({ prepare() { throw new Error("D1 caída"); }, batch() {} }, "digest", { at: "x", ok: true, sent: false, message: "" });
});
