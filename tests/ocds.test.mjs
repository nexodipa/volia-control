import assert from "node:assert/strict";
import test from "node:test";
import { cpcMatches, extractMarketItems } from "../lib/ocds.ts";

const release = {
  ocid: "ocds-5wno2w-SIE-MDMQ-2026-2503", date: "2026-09-01T10:00:00Z", buyer: { name: "GAD DMQ" },
  tender: { status: "complete", procurementMethodDetails: "Subasta Inversa Electrónica", items: [
    { id: "1", description: "Jeringa 3 ml", quantity: 629, unit: { name: "UNIDAD", value: { amount: 0.16 } }, classification: { id: "352901091" } },
    { id: "2", description: "Servicio de limpieza", quantity: 1, classification: { id: "853300011" } },
  ] },
  awards: [{ suppliers: [{ name: "VOLIA S.A.S." }], items: [{ id: "1", unit: { value: { amount: 0.15 } } }] }],
};

test("cpc prefix matching ignores punctuation", () => {
  assert.ok(cpcMatches("35290.10.91", ["352901"]));
  assert.ok(!cpcMatches("853300011", ["3529"]));
});

test("extracts only items with the CPC and links the award", () => {
  const items = extractMarketItems(release, ["3529"]);
  assert.equal(items.length, 1);
  assert.equal(items[0].referenceUnitPrice, 0.16);
  assert.equal(items[0].awardedUnitPrice, 0.15);
  assert.equal(items[0].awardedSupplier, "VOLIA S.A.S.");
  assert.equal(items[0].method, "Subasta Inversa Electrónica");
});

import { isRelevantProcess, summarizeProcess } from "../lib/ocds.ts";

test("process summary detects our bid and win and sums award values", () => {
  const rel = { ocid: "p1", buyer: { name: "GAD DMQ" }, tender: { description: "Adquisición de dispositivos médicos de uso general", procurementMethodDetails: "Subasta Inversa Electrónica", tenderers: [{ name: "VOLIA S.A.S." }, { name: "OTRA" }] }, awards: [{ suppliers: [{ name: "VOLIA S.A.S." }], value: { amount: 100.5 } }, { suppliers: [{ name: "VOLIA S.A.S." }], value: { amount: 50.25 } }] };
  const s = summarizeProcess(rel);
  assert.equal(s.weBid, true);
  assert.equal(s.weWon, true);
  assert.equal(s.tenderers, 2);
  assert.equal(s.awardedAmount, 150.75);
  assert.equal(s.winners, "VOLIA S.A.S.");
  assert.equal(isRelevantProcess(rel), true);
});

test("cleaning-supplies catalog and unrelated processes are excluded", () => {
  const cleaning = { tender: { description: "GUANTES DE CAUCHO", procurementMethodDetails: "Catálogo electrónico - Insumos de limpieza" } };
  const transport = { tender: { description: "Servicio de transporte de personal" } };
  assert.equal(isRelevantProcess(cleaning), false);
  assert.equal(isRelevantProcess(transport), false);
});
