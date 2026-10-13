import assert from "node:assert/strict";
import test from "node:test";

import { checkMarginFloor, daysUntil, expiringDocuments, expiryStatus, marginBps, overdueReceivables } from "../lib/business-alerts.ts";

test("expiryStatus classifies by days", () => {
  assert.equal(expiryStatus("2026-10-01", "2026-10-12"), "vencido");
  assert.equal(expiryStatus("2026-10-12", "2026-10-12"), "critico");
  assert.equal(expiryStatus("2026-11-20", "2026-10-12"), "proximo");
  assert.equal(expiryStatus("2027-06-01", "2026-10-12"), "vigente");
});

test("expiringDocuments sorts by urgency and reports undated docs", () => {
  const r = expiringDocuments(
    [
      { id: 1, kind: "ARCSA", reference: "A", expiresAt: "2026-12-01" },
      { id: 2, kind: "ARCSA", reference: "B", expiresAt: "2026-10-01" },
      { id: 3, kind: "ARCSA", reference: "C", expiresAt: "2028-01-01" },
      { id: 4, kind: "RUC", reference: "D", expiresAt: null },
    ],
    "2026-10-12",
  );
  assert.deepEqual(r.alerts.map((a) => a.id), [2, 1]);
  assert.equal(r.withoutDate[0].id, 4);
});

test("margin: informe de necesidad is ~48% over price", () => {
  // costo 10219.34, PVP 19779.24
  assert.equal(marginBps(1_021_934, 1_977_924), 4833);
  const c = checkMarginFloor(1_000, 1_100, 2000);
  assert.equal(c.belowFloor, true);
  assert.equal(c.minPriceCents, 1250);
});

test("overdue receivables respect term and ignore paid", () => {
  const r = overdueReceivables(
    [
      { invoiceRef: "1", customer: "A", totalCents: 100, issuedAt: "2026-08-01" },
      { invoiceRef: "2", customer: "B", totalCents: 100, issuedAt: "2026-10-01" },
      { invoiceRef: "3", customer: "C", totalCents: 100, issuedAt: "2026-07-01", paidAt: "2026-07-20" },
    ],
    "2026-10-12",
  );
  assert.deepEqual(r.map((x) => x.invoiceRef), ["1"]);
  assert.equal(r[0].daysOverdue, 72 - 30);
  assert.equal(daysUntil("2026-10-13", "2026-10-12"), 1);
});
