import assert from "node:assert/strict";
import test from "node:test";
import { applyRemote, computeLocalChanges, validateSharedRecords } from "../lib/shared-records.ts";

const now = "2026-10-13T20:00:00.000Z";

test("first sync uploads everything; later only what changed, plus deletions", () => {
  const items = [{ id: "a", stock: 1 }, { id: "b", stock: 2 }];
  assert.deepEqual(computeLocalChanges(items, {}, now).map((c) => c.id), ["a", "b"]);
  const shadow = { a: JSON.stringify(items[0]), b: JSON.stringify(items[1]), c: JSON.stringify({ id: "c" }) };
  const changes = computeLocalChanges([{ id: "a", stock: 5 }, items[1]], shadow, now);
  assert.deepEqual(changes.map((c) => [c.id, c.deleted]), [["a", false], ["c", true]]);
});

test("applyRemote: server wins, keeps local order, prepends new, drops tombstones", () => {
  const local = [{ id: "a", stock: 1 }, { id: "b", stock: 2 }, { id: "x", stock: 9 }];
  const remote = [
    { id: "a", data: { id: "a", stock: 7 }, updatedAt: "2026-10-13T10:00:00Z", deleted: false },
    { id: "b", data: { id: "b", stock: 2 }, updatedAt: "2026-10-13T09:00:00Z", deleted: false },
    { id: "x", data: null, updatedAt: "2026-10-13T11:00:00Z", deleted: true },
    { id: "n", data: { id: "n", stock: 3 }, updatedAt: "2026-10-13T12:00:00Z", deleted: false },
  ];
  const { next, shadow, changed } = applyRemote(local, remote);
  assert.deepEqual(next.map((i) => `${i.id}:${i.stock}`), ["n:3", "a:7", "b:2"]);
  assert.equal(changed, true);
  assert.deepEqual(Object.keys(shadow).sort(), ["a", "b", "n"]);
  assert.equal(applyRemote(next, remote).changed, false);
});

test("round trip: after applying remote, nothing is pending to upload", () => {
  const remote = [{ id: "a", data: { id: "a", v: 1 }, updatedAt: now, deleted: false }];
  const { next, shadow } = applyRemote([], remote);
  assert.equal(computeLocalChanges(next, shadow, now).length, 0);
});

test("validation", () => {
  assert.equal(validateSharedRecords([{ id: "a", data: { id: "a" }, updatedAt: now }]).ok, true);
  assert.equal(validateSharedRecords([{ id: "a", deleted: true, updatedAt: now }]).ok, true);
  assert.equal(validateSharedRecords([{ id: "a", data: { id: "b" }, updatedAt: now }]).ok, false);
  assert.equal(validateSharedRecords([{ id: "a b", data: { id: "a b" }, updatedAt: now }]).ok, false);
  assert.equal(validateSharedRecords([{ id: "a", data: [1], updatedAt: now }]).ok, false);
  assert.equal(validateSharedRecords([{ id: "a", data: { id: "a", big: "x".repeat(30000) }, updatedAt: now }]).ok, false);
  assert.equal(validateSharedRecords([{ id: "a", data: { id: "a" }, updatedAt: "ayer" }]).ok, false);
});
