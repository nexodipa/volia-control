import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

// Ejecuta docs/correo-volia.gs con un GmailApp de mentira que falla si el script intenta algo más que leer y etiquetar.
function load({ props = { SECRET: "s3cretkey" }, threads } = {}) {
  const log = [];
  const forbid = (name) => () => { throw new Error(`el script no debe llamar a ${name}`); };
  const thread = (id, msgs) => ({ getId: () => id, getMessages: () => msgs, addLabel: (l) => log.push(`label:${l}`), moveToTrash: forbid("moveToTrash"), moveToArchive: forbid("moveToArchive") });
  const msg = (id, t) => ({ getId: () => id, isInTrash: () => false, getFrom: () => "a <a@b.com>", getSubject: () => `Asunto ${id}`, getDate: () => new Date("2026-11-17T10:00:00Z"), getPlainBody: () => "x".repeat(9000), getAttachments: () => [{ getName: () => "f.pdf", getSize: () => 10, getBytes: forbid("getBytes") }], getThread: () => t, reply: forbid("reply"), forward: forbid("forward") });
  const ts = (threads ?? [["t1", ["m1", "m2"]], ["t2", ["m3"]]]).map(([id, ids]) => { const t = thread(id, []); t.getMessages = () => ids.map((i) => msg(i, t)); return t; });
  const byMsg = new Map(); ts.forEach((t) => t.getMessages().forEach((m) => byMsg.set(m.getId(), m)));
  const sandbox = {
    GmailApp: { search: (q) => { log.push(`q:${q}`); return ts; }, getUserLabelByName: () => null, createLabel: (n) => n, getMessageById: (id) => byMsg.get(id) ?? null, sendEmail: forbid("sendEmail") },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] }) },
    ContentService: { createTextOutput: (s) => ({ s, setMimeType() { return this; } }), MimeType: { JSON: 1 } },
    Logger: { log: () => {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(new URL("../docs/correo-volia.gs", import.meta.url), "utf8"), sandbox);
  const run = (b) => JSON.parse(sandbox.doPost({ postData: { contents: JSON.stringify(b) } }).s);
  return { run, log };
}

test("script: rejects a wrong or missing key and unknown actions", () => {
  const { run } = load();
  assert.deepEqual(run({ secret: "otra", action: "pull" }), { ok: false, error: "forbidden" });
  assert.equal(run({ action: "pull" }).ok, false);
  assert.equal(run({ secret: "s3cretkey", action: "borrar" }).ok, false);
  assert.equal(load({ props: {} }).run({ secret: "undefined", action: "pull" }).ok, false);
});

test("script: pull is limited to label:volia even if QUERY is edited without it, and skips processed threads", () => {
  const { run, log } = load({ props: { SECRET: "s3cretkey", QUERY: "from:alguien newer_than:5d" } });
  run({ secret: "s3cretkey", action: "pull" });
  assert.equal(log[0], "q:label:volia from:alguien newer_than:5d -label:volia-leido");
});

test("script: pull returns trimmed text, attachment names only and a Gmail link", () => {
  const { run } = load();
  const r = run({ secret: "s3cretkey", action: "pull", max: 40 });
  assert.equal(r.mails.length, 3);
  assert.equal(r.mails[0].body.length, 4000);
  assert.deepEqual(r.mails[0].attachments, [{ name: "f.pdf", size: 10 }]);
  assert.match(r.mails[0].link, /^https:\/\/mail\.google\.com\//);
});

test("script: a conversation is delivered whole or left for the next pull", () => {
  const { run } = load({ threads: [["t1", ["a1", "a2", "a3"]], ["t2", ["b1", "b2", "b3"]]] });
  const r = run({ secret: "s3cretkey", action: "pull", max: 4 });
  assert.deepEqual(r.mails.map((m) => m.id), ["a1", "a2", "a3"]);
});

test("script: ack labels each conversation once and never deletes, sends or archives", () => {
  const { run, log } = load();
  const r = run({ secret: "s3cretkey", action: "ack", ids: ["m1", "m2", "m3", "inexistente"] });
  assert.equal(r.acked, 2);
  assert.deepEqual(log.filter((l) => l.startsWith("label:")), ["label:volia-leido", "label:volia-leido"]);
});
