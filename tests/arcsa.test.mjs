import assert from "node:assert/strict";
import test from "node:test";
import { applyArcsa, arcsaSuggestions, findArcsa, refKeys } from "../lib/arcsa.ts";

const catastro = { fuente: "x", corte: "2026-04-01", registros: {
  "12578-DME-0122": ["2022-01-04", "2027-01-04", "PRODIMEDA", "Jeringas"],
  "DM26680613": ["2013-06-11", "2028-06-11", "BIO-IN", "Microgotero"],
  "10169-DME-0920": ["2020-09-29", "2030-09-29", "PRODIMEDA", "A"],
  "9442-DME-0720": ["2020-07-16", "2030-07-16", "PRODIMEDA", "B"],
} };
const rec = (id, reference, expiresAt, kind = "Registro sanitario") => ({ id, kind, reference, subject: "", items: "", expiresAt, note: "Nota." });

test("reference keys cover old DM format and pairs", () => {
  assert.deepEqual(refKeys("DM-2668-06-13"), ["DM-2668-06-13", "DM26680613"]);
  assert.equal(findArcsa("DM-2668-06-13", catastro).entry[1], "2028-06-11");
  assert.equal(findArcsa("10169-DME-0920 / 9442-DME-0720", catastro).key, "10169-DME-0920");
});

test("suggests only missing or later dates and applies them with a note", () => {
  const records = [rec("a", "12578-DME-0122", null), rec("b", "DM-2668-06-13", "2029-01-01"), rec("c", "10169-DME-0920 / 9442-DME-0720", "2026-01-01"), rec("d", "ISO 9001", null, "ISO"), rec("e", "999-DME-0101", null)];
  const s = arcsaSuggestions(records, catastro);
  assert.deepEqual(s.map((x) => x.id), ["a", "c"]);
  const next = applyArcsa(records, s, catastro.corte, "2026-10-22T00:00:00Z");
  assert.equal(next[0].expiresAt, "2027-01-04");
  assert.match(next[0].note, /catastro ARCSA \(corte 2026-04-01\)/);
  assert.equal(next[1], records[1]);
  assert.equal(arcsaSuggestions(next, catastro).length, 0);
});
