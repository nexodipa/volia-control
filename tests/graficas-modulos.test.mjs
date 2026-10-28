import assert from "node:assert/strict";
import test from "node:test";
import { expiryByMonth, stockHealth } from "../lib/inventory-stats.ts";
import { monthlySeries } from "../lib/monthly-report.ts";

const item = (o) => ({ product: "P", expiry: "", stock: 10, reserved: 0, minimum: 2, unitCost: 5, ...o });

test("caducidades por mes: reparte el valor, separa lo vencido e ignora lo sin stock o sin fecha", () => {
  const out = expiryByMonth([
    item({ expiry: "2026-10-30" }), item({ expiry: "2026-11-15", stock: 4, unitCost: 10 }), item({ expiry: "2027-09-01" }),
    item({ expiry: "2026-09-01" }), item({ expiry: "2026-11-01", stock: 0 }), item({ expiry: "" }), item({ expiry: "2030-01-01" }),
  ], "2026-10-27", 12);
  assert.equal(out.months.length, 12);
  assert.deepEqual(out.months[0], { key: "2026-10", label: "oct", value: 50, units: 10 });
  assert.deepEqual([out.months[1].value, out.months[1].units], [40, 4]);
  assert.equal(out.months[11].key, "2027-09"); assert.equal(out.months[11].value, 50);
  assert.deepEqual(out.expired, { value: 50, units: 10 });
});

test("estado del inventario: cada producto cuenta una sola vez, en orden de gravedad", () => {
  const h = stockHealth([
    item({ expiry: "2026-10-01" }), item({ expiry: "2026-12-01", stock: 1, minimum: 5 }), item({ expiry: "2028-01-01", stock: 3, minimum: 5 }),
    item({ expiry: "2028-01-01" }), item({ expiry: "", stock: 0, minimum: 2 }),
  ], "2026-10-27");
  assert.deepEqual(h, { vencido: 1, porVencer: 1, bajoMinimo: 2, ok: 1 });
});

test("serie mensual de finanzas: seis meses terminando en el actual, con cambio de año", () => {
  const rec = (date, subtotal, direction = "income") => ({ direction, status: "paid", date, dueDate: "", counterparty: "", document: "", subtotal, iva: 0, withholding: 0 });
  const s = monthlySeries([rec("2026-12-05", 100), rec("2027-01-10", 200), rec("2027-01-20", 50, "expense"), rec("2026-07-01", 999)], "2027-01-15", 6);
  assert.deepEqual(s.map((x) => x.key), ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"]);
  assert.deepEqual([s[4].billed, s[5].billed, s[5].expenses], [100, 200, 50]);
  assert.equal(s.reduce((t, x) => t + x.billed, 0), 300, "julio queda fuera");
});
