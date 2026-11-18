import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { listMail, listMailMeta, mailSummary, parseMailSources, pruneMail, setMailStatus, syncAll, syncMailbox } from "../lib/mail-sync.ts";

// D1 de mentira sobre SQLite real: mismo SQL, misma forma de respuesta (prepare/bind/all/batch con meta.changes).
function fakeD1() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(fs.readFileSync(new URL("../drizzle/0002_registros_compartidos.sql", import.meta.url), "utf8").replace(/--> statement-breakpoint/g, ""));
  return {
    sql,
    prepare(q) {
      return {
        bind: (...v) => ({ all: async () => ({ results: sql.prepare(q).all(...v) }), run: () => ({ meta: { changes: Number(sql.prepare(q).run(...v).changes) } }) }),
        all: async () => ({ results: sql.prepare(q).all() }),
      };
    },
    async batch(stmts) { return stmts.map((s) => s.run()); },
  };
}

const URL_OK = "https://script.google.com/macros/s/AKfycbxTEST123/exec";
const SRC = { name: "Josué", url: URL_OK, secret: "clave-larga-123" };
const NOW = new Date("2026-11-18T13:00:00Z");

const mail = (id, o = {}) => ({ id, from: "Compras <no-reply@compraspublicas.gob.ec>", subject: "Invitación SIE-HEEE-2026-049-52558", date: "2026-11-17T15:00:00Z", body: "Presente su oferta hasta el 20/11/2026.", link: `https://mail.google.com/mail/u/0/#all/${id}`, attachments: [{ name: "pliego.pdf", size: 1000 }], ...o });

function fakeScript(mails, { failAck = false, failPull = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body); calls.push(body);
    const json = (o, status = 200) => ({ ok: status < 400, status, json: async () => o });
    if (body.secret !== SRC.secret) return json({ ok: false, error: "clave" }, 403);
    if (body.action === "pull") return failPull ? json({ ok: false, error: "boom" }, 500) : json({ ok: true, mails });
    if (body.action === "ack") return failAck ? json({ ok: false, error: "sin permiso" }, 500) : json({ ok: true, acked: body.ids.length });
    return json({ ok: false }, 400);
  };
  return { fetchImpl, calls };
}

test("sources: only well-formed entries with a script.google.com URL survive", () => {
  const raw = JSON.stringify([SRC, { ...SRC, name: "Josué" }, { name: "B", url: "http://evil.com/x", secret: "clave-larga-123" }, { name: "C", url: URL_OK, secret: "corta" }, { name: "Ventas", url: URL_OK, secret: "otra-clave-1" }, 7]);
  assert.deepEqual(parseMailSources(raw).map((s) => s.name), ["Josué", "Ventas"]);
  assert.deepEqual(parseMailSources("no es json"), []);
  assert.deepEqual(parseMailSources(undefined), []);
});

test("sync: classifies, stores, acknowledges and is idempotent", async () => {
  const db = fakeD1();
  const { fetchImpl, calls } = fakeScript([mail("18f0a1b2c3"), mail("18f0a1b2c4", { from: "x@hospital.com", subject: "Cotización de insumos", body: "Necesitamos cotizar guantes. Precio unitario y disponibilidad.", attachments: [] })]);
  const r = await syncMailbox(db, SRC, { fetchImpl, now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.added, 2);
  assert.deepEqual(calls.map((c) => c.action), ["pull", "ack"]);
  assert.deepEqual(calls[1].ids, ["18f0a1b2c3", "18f0a1b2c4"]);
  const list = await listMail(db);
  assert.equal(list.length, 2);
  const sercop = list.find((m) => m.id === "Josué:18f0a1b2c3");
  assert.equal(sercop.category, "sercop");
  assert.deepEqual(sercop.fields.processCodes, ["SIE-HEEE-2026-049-52558"]);
  assert.equal(sercop.status, "nuevo");
  assert.equal(list.find((m) => m.id === "Josué:18f0a1b2c4").category, "cotizacion");
  // segunda corrida con los mismos correos: no se duplica
  const again = await syncMailbox(db, SRC, { fetchImpl, now: NOW });
  assert.equal(again.added, 0);
  assert.equal((await listMail(db)).length, 2);
});

test("sync: a repeat pull never overwrites a status the person already set", async () => {
  const db = fakeD1();
  const { fetchImpl } = fakeScript([mail("18f0a1b2c3")]);
  await syncMailbox(db, SRC, { fetchImpl, now: NOW });
  await setMailStatus(db, "Josué:18f0a1b2c3", "revisado", "josue@volia.ec", NOW);
  await syncMailbox(db, SRC, { fetchImpl, now: NOW });
  assert.equal((await listMail(db))[0].status, "revisado");
});

test("sync: failures are reported and recorded, not thrown", async () => {
  const db = fakeD1();
  const bad = await syncMailbox(db, SRC, { fetchImpl: fakeScript([], { failPull: true }).fetchImpl, now: NOW });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /No se pudo leer el buzón/);
  const wrong = await syncMailbox(db, { ...SRC, secret: "otra-clave-xx" }, { fetchImpl: fakeScript([mail("18f0a1b2c3")]).fetchImpl, now: NOW });
  assert.equal(wrong.ok, false);
  const meta = await listMailMeta(db);
  assert.equal(meta["Josué"].ok, false);
  // si el ack falla, igual quedan guardados y se avisa
  const half = await syncMailbox(db, SRC, { fetchImpl: fakeScript([mail("18f0a1b2c3")], { failAck: true }).fetchImpl, now: NOW });
  assert.equal(half.ok, true);
  assert.equal(half.added, 1);
  assert.match(half.message, /no se pudieron marcar/);
});

test("sync: malformed mails are skipped and secrets in the body never reach the database", async () => {
  const db = fakeD1();
  const { fetchImpl } = fakeScript([mail("18f0a1b2c3", { body: "Su clave: SuperSecreta99 y tarjeta 4111111111111111. Pedido OC-2231 para el 25/11/2026." }), { id: "../x", subject: "mal" }, mail("18f0a1b2c9", { date: "no es fecha" }), mail("18f0a1b2d0", { link: "https://evil.com/" })]);
  const r = await syncMailbox(db, SRC, { fetchImpl, now: NOW });
  assert.equal(r.added, 2);
  const raw = db.sql.prepare("SELECT data FROM shared_records WHERE collection = 'mail'").all().map((x) => x.data).join("\n");
  assert.ok(!raw.includes("SuperSecreta99"));
  assert.ok(!raw.includes("4111111111111111"));
  assert.equal((await listMail(db)).find((m) => m.id.endsWith("18f0a1b2d0")).link, "");
});

test("sync: syncAll isolates a failing mailbox", async () => {
  const db = fakeD1();
  const ok = fakeScript([mail("18f0a1b2c3")]).fetchImpl;
  const res = await syncAll(db, [SRC, { name: "Ventas", url: URL_OK, secret: "otra-clave-1" }], { fetchImpl: ok, now: NOW });
  assert.deepEqual(res.map((r) => [r.source, r.ok]), [["Josué", true], ["Ventas", false]]);
});

test("prune: removes mail untouched for 90 days, keeps recent and touched ones", async () => {
  const db = fakeD1();
  await syncMailbox(db, SRC, { fetchImpl: fakeScript([mail("18f0a1b2c3"), mail("18f0a1b2c4")]).fetchImpl, now: new Date("2026-06-01T00:00:00Z") });
  await setMailStatus(db, "Josué:18f0a1b2c4", "revisado", "a@b.c", new Date("2026-10-30T00:00:00Z"));
  await pruneMail(db, NOW);
  assert.deepEqual((await listMail(db)).map((m) => m.id), ["Josué:18f0a1b2c4"]);
});

test("summary: counts pending mail and the nearest deadline", async () => {
  const db = fakeD1();
  await syncMailbox(db, SRC, { fetchImpl: fakeScript([mail("18f0a1b2c3")]).fetchImpl, now: NOW });
  const s = mailSummary(await listMail(db), "2026-11-18");
  assert.equal(s.pending, 1);
  assert.equal(s.nextDeadline, "2026-11-20");
  assert.equal(s.urgent, 1);
});
