import assert from "node:assert/strict";
import test from "node:test";
import { ensureMapPolyfills } from "../lib/polyfills.ts";

test("suple getOrInsert y getOrInsertComputed en Map y WeakMap cuando faltan", () => {
  const saved = [Map, WeakMap].map((C) => [C, C.prototype.getOrInsert, C.prototype.getOrInsertComputed]);
  try {
    for (const [C] of saved) { delete C.prototype.getOrInsert; delete C.prototype.getOrInsertComputed; }
    ensureMapPolyfills();
    const m = new Map(); let calls = 0;
    assert.equal(m.getOrInsert("a", 1), 1); assert.equal(m.getOrInsert("a", 2), 1);
    assert.equal(m.getOrInsertComputed("b", (k) => { calls += 1; return k + "!"; }), "b!"); assert.equal(m.getOrInsertComputed("b", () => { calls += 1; return "x"; }), "b!"); assert.equal(calls, 1);
    const k = {}; const w = new WeakMap(); assert.equal(w.getOrInsert(k, 7), 7); assert.equal(w.getOrInsertComputed(k, () => 9), 7);
  } finally { for (const [C, a, b] of saved) { if (a) C.prototype.getOrInsert = a; else delete C.prototype.getOrInsert; if (b) C.prototype.getOrInsertComputed = b; else delete C.prototype.getOrInsertComputed; } }
});

test("no pisa las funciones nativas si ya existen", () => {
  const native = function nativo() { return "nativo"; };
  const saved = Map.prototype.getOrInsert; Map.prototype.getOrInsert = native;
  try { ensureMapPolyfills(); assert.equal(Map.prototype.getOrInsert, native); } finally { if (saved) Map.prototype.getOrInsert = saved; else delete Map.prototype.getOrInsert; }
});
