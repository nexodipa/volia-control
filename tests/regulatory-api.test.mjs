import assert from "node:assert/strict";
import test from "node:test";
import { fromRow, toRow, validateRecords } from "../lib/regulatory-api.ts";
import { REGULATORY_SEED } from "../lib/regulatory-data.ts";

test("the whole seed validates and round-trips through the DB row format", () => {
  const checked = validateRecords(REGULATORY_SEED);
  assert.equal(checked.ok, true);
  for (const r of checked.records) assert.deepEqual(fromRow(toRow(r)), r);
  assert.equal(toRow(REGULATORY_SEED[0]).kind, "registro_sanitario");
});

test("rejects bad input", () => {
  assert.equal(validateRecords("x").ok, false);
  assert.equal(validateRecords([{ id: "a b", kind: "ISO", reference: "x" }]).ok, false);
  assert.equal(validateRecords([{ id: "a", kind: "Otro", reference: "x" }]).ok, false);
  assert.equal(validateRecords([{ id: "a", kind: "ISO", reference: "x", expiresAt: "13/10/2026" }]).ok, false);
  assert.equal(validateRecords([{ id: "a", kind: "ISO", reference: "x" }, { id: "a", kind: "ISO", reference: "y" }]).ok, false);
  const ok = validateRecords([{ id: "a", kind: "ISO", reference: "  x  ", expiresAt: "" }]);
  assert.equal(ok.ok, true);
  assert.equal(ok.records[0].reference, "x");
  assert.equal(ok.records[0].expiresAt, null);
});
