import assert from "node:assert/strict";
import test from "node:test";

import { expiringDocuments } from "../lib/business-alerts.ts";
import { REGULATORY_SEED } from "../lib/regulatory-data.ts";

test("seed has unique ids and valid ISO dates", () => {
  const ids = new Set(REGULATORY_SEED.map((r) => r.id));
  assert.equal(ids.size, REGULATORY_SEED.length);
  for (const r of REGULATORY_SEED) if (r.expiresAt) assert.match(r.expiresAt, /^\d{4}-\d{2}-\d{2}$/);
});

test("on 2026-10-13 the seed flags the expired ISO copy and the syringes registration first", () => {
  const { alerts, withoutDate } = expiringDocuments(
    REGULATORY_SEED.map((r, i) => ({ id: i, kind: r.kind, reference: r.reference, expiresAt: r.expiresAt })),
    "2026-10-13",
    90,
  );
  assert.equal(alerts[0].reference, "ISO en el compilado REGISTRO SANITARIO.pdf");
  assert.equal(alerts[1].reference, "12578-DME-0122");
  assert.equal(alerts[1].days, 83);
  assert.equal(withoutDate.length, 3);
});
