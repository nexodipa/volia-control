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

import { mergeRegulatory } from "../lib/regulatory-api.ts";

test("merge keeps the newest edit per document and pushes local-only or newer records", () => {
  const base = { kind: "ISO", reference: "r", subject: "", items: "", note: "" };
  const local = [
    { ...base, id: "a", expiresAt: "2027-01-01", updatedAt: "2026-10-13T10:00:00Z" }, // editado sin conexión, más nuevo
    { ...base, id: "b", expiresAt: "2027-02-01" }, // sin marca: el servidor manda
    { ...base, id: "c", expiresAt: "2027-03-01" }, // solo existe aquí
  ];
  const remote = [
    { ...base, id: "a", expiresAt: "2026-12-01", updatedAt: "2026-10-12T10:00:00Z" },
    { ...base, id: "b", expiresAt: "2028-02-01", updatedAt: "2026-10-01T10:00:00Z" },
    { ...base, id: "d", expiresAt: "2029-01-01" }, // creado en otro equipo
  ];
  const { merged, toPush } = mergeRegulatory(local, remote);
  const get = (id) => merged.find((r) => r.id === id).expiresAt;
  assert.equal(get("a"), "2027-01-01");
  assert.equal(get("b"), "2028-02-01");
  assert.equal(get("c"), "2027-03-01");
  assert.equal(get("d"), "2029-01-01");
  assert.deepEqual(toPush.map((r) => r.id).sort(), ["a", "c"]);
});

test("future timestamps are clamped on validation", () => {
  const r = validateRecords([{ id: "a", kind: "ISO", reference: "x", updatedAt: "2099-01-01T00:00:00Z" }]);
  assert.ok(Date.parse(r.records[0].updatedAt) < Date.parse("2099-01-01"));
});
