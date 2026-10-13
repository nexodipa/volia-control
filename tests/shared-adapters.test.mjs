import assert from "node:assert/strict";
import test from "node:test";
import { aliasId, ensureIds, quoteId, restoreQuote, shareQuote } from "../lib/shared-adapters.ts";
import { applyRemote, computeLocalChanges, validateSharedRecords } from "../lib/shared-records.ts";
import { rememberAlias } from "../lib/requirement-import.ts";

const quote = {
  number: "VOL-2026-031", date: "2026-10-13", customer: "Hospital Eugenio Espejo", total: 120.5, savedAt: "2026-10-13T20:00:00.000Z",
  data: { meta: { number: "VOL-2026-031", customer: "Hospital Eugenio Espejo", patient: "Juan Pérez", hcl: "123456", patientAddress: "Av. X", doctor: "Dr. Y" }, items: [{ code: "GZ-01", qty: 10 }], totals: { total: 120.5 } },
};

test("quote ids are stable, valid for the API and follow the local dedup identity", () => {
  const id = quoteId(quote);
  assert.match(id, /^q-[0-9a-f]{16}$/);
  assert.equal(quoteId({ ...quote, total: 999 }), id);
  assert.notEqual(quoteId({ ...quote, number: "VOL-2026-032" }), id);
  assert.equal(quoteId({ number: "  ", date: "2026-10-13", customer: "A" }), quoteId({ number: "", date: "2026-10-13", customer: "A" }));
});

test("shared quote never carries patient fields; restore puts them back only from this device", () => {
  const withId = { ...quote, id: quoteId(quote) };
  const shared = shareQuote(withId);
  const json = JSON.stringify(shared);
  for (const secret of ["Juan Pérez", "123456", "Av. X"]) assert.ok(!json.includes(secret), secret);
  assert.equal(shared.data.meta.doctor, "Dr. Y");
  assert.equal(withId.data.meta.patient, "Juan Pérez", "original untouched");
  assert.equal(restoreQuote(shared, withId).data.meta.patient, "Juan Pérez");
  assert.equal(restoreQuote(shared, undefined).data.meta.patient, undefined, "another device never sees the patient");
});

test("editing only patient data does not trigger an upload", () => {
  const local = [{ ...quote, id: quoteId(quote) }];
  const outgoing = local.map(shareQuote);
  const { shadow } = applyRemote(outgoing, outgoing.map((d) => ({ id: d.id, data: d, updatedAt: "2026-10-13T20:00:00Z", deleted: false })));
  const edited = [{ ...local[0], data: { ...local[0].data, meta: { ...local[0].data.meta, patient: "Otra persona" } } }];
  assert.equal(computeLocalChanges(edited.map(shareQuote), shadow, "2026-10-13T21:00:00Z").length, 0);
});

test("legacy items get ids once; aliases get the same id the importer assigns", () => {
  const legacy = [{ normalizedText: "gasa esteril 10x10", customerKey: "hospital eugenio espejo", code: "GZ-01", confirmedAt: "x" }];
  const { items, changed } = ensureIds(legacy, aliasId);
  assert.equal(changed, true);
  assert.match(items[0].id, /^al-[0-9a-f]{16}$/);
  assert.equal(ensureIds(items, aliasId).changed, false);
  const remembered = rememberAlias([], "Gasa estéril 10x10", "Hospital Eugenio Espejo", "GZ-01");
  assert.equal(remembered[0].id, aliasId(remembered[0]));
});

test("API accepts the new collections' records", () => {
  const record = { id: quoteId(quote), data: shareQuote({ ...quote, id: quoteId(quote) }), updatedAt: "2026-10-13T20:00:00Z", deleted: false };
  assert.equal(validateSharedRecords([record]).ok, true);
});
