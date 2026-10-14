import assert from "node:assert/strict";
import test from "node:test";
import { linkQuotesToProcesses, processBase, processCodesIn } from "../lib/quote-market.ts";

test("process codes are found in free text and match the market id without the OCDS suffix", () => {
  assert.equal(processBase("SIE-MDMQ-2026-2503-41357"), "SIE-MDMQ-2026-2503");
  assert.deepEqual(processCodesIn("Proceso sie-mdmq-2026-2503, lote 1"), ["SIE-MDMQ-2026-2503"]);
  assert.deepEqual(processCodesIn("Contrato privado 45"), []);
});

test("links the latest quote per process using net subtotal (without VAT) and cost", () => {
  const ids = ["SIE-MDMQ-2026-2503-41357", "SIE-HCAM-2025-286-54651"];
  const quotes = [
    { number: "VOL-1", date: "2026-05-01", savedAt: "2026-05-01T10:00:00Z", total: 22745.13, data: { meta: { contract: "SIE-MDMQ-2026-2503" }, totals: { netSubtotal: 19779.24, totalCost: 10219.34, total: 22745.13 } } },
    { number: "VOL-2", date: "2026-05-03", savedAt: "2026-05-03T10:00:00Z", total: 21000, data: { meta: { contract: "Proceso SIE-MDMQ-2026-2503 (revisada)" }, totals: { netSubtotal: 18260.87, totalCost: 10219.34 } } },
    { number: "VOL-3", savedAt: "2026-06-01T10:00:00Z", total: 500, data: { meta: { contract: "" }, totals: { netSubtotal: 500 } } },
  ];
  const links = linkQuotesToProcesses(ids, quotes);
  assert.equal(links.size, 1);
  const l = links.get("SIE-MDMQ-2026-2503-41357");
  assert.equal(l.number, "VOL-2");
  assert.equal(l.netCents, 1826087);
  assert.equal(l.costCents, 1021934);
});
