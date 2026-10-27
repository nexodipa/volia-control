import assert from "node:assert/strict";
import test from "node:test";
import { dataFingerprint, shouldAutoBackup } from "../lib/auto-backup.ts";

test("la huella no depende del orden y cambia si cambia un dato", () => {
  assert.equal(dataFingerprint({ a: "1", b: "2" }), dataFingerprint({ b: "2", a: "1" }));
  assert.notEqual(dataFingerprint({ a: "1", b: "2" }), dataFingerprint({ a: "1", b: "3" }));
  assert.notEqual(dataFingerprint({ a: "12" }), dataFingerprint({ a: "1", "2": "" }));
});
test("solo guarda si está activado, hay cambios, hay conexión y pasó el intervalo", () => {
  const base = { armed: true, busy: false, online: true, changed: true, now: 1_000_000, lastAttemptAt: 0 };
  assert.equal(shouldAutoBackup(base), true);
  assert.equal(shouldAutoBackup({ ...base, armed: false }), false);
  assert.equal(shouldAutoBackup({ ...base, busy: true }), false);
  assert.equal(shouldAutoBackup({ ...base, online: false }), false);
  assert.equal(shouldAutoBackup({ ...base, changed: false }), false);
  assert.equal(shouldAutoBackup({ ...base, lastAttemptAt: base.now - 60_000 }), false);
  assert.equal(shouldAutoBackup({ ...base, lastAttemptAt: base.now - 300_000 }), true);
});
