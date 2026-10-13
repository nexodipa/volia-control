import assert from "node:assert/strict";
import test from "node:test";
import { fromProductRow, toProductRow, validateProducts } from "../lib/catalog-api.ts";
import { mergeByUpdatedAt } from "../lib/sync-merge.ts";

const P = (o) => ({ id: "x", code: "A1", description: "Placa", brand: "", origin: "", category: "Traumatología", unitCost: 10.1, salePrice: 19.99, active: true, updatedAt: "2026-10-13T10:00:00.000Z", ...o });

test("products validate, normalize code and round-trip through cents", () => {
  const r = validateProducts([P({ code: " f14ab-pa01329 " })]);
  assert.equal(r.ok, true);
  assert.equal(r.products[0].code, "F14AB-PA01329");
  const back = fromProductRow(toProductRow(r.products[0]));
  assert.equal(back.unitCost, 10.1);
  assert.equal(back.salePrice, 19.99);
  assert.equal(toProductRow(r.products[0]).sale_price_cents, 1999);
});

test("rejects bad products", () => {
  assert.equal(validateProducts([P({ code: "" })]).ok, false);
  assert.equal(validateProducts([P({ description: " " })]).ok, false);
  assert.equal(validateProducts([P({ salePrice: -1 })]).ok, false);
  assert.equal(validateProducts([P({ unitCost: "10" })]).ok, false);
  assert.equal(validateProducts([P(), P({ code: "a1" })]).ok, false);
});

test("generic merge works on product codes", () => {
  const local = [P({ code: "A1", salePrice: 25, updatedAt: "2026-10-13T12:00:00Z" }), P({ code: "B2" })];
  const remote = [P({ code: "A1", salePrice: 20, updatedAt: "2026-10-12T00:00:00Z" }), P({ code: "C3" })];
  const { merged, toPush } = mergeByUpdatedAt(local, remote, (p) => p.code);
  assert.deepEqual(merged.map((p) => `${p.code}:${p.salePrice}`), ["A1:25", "B2:19.99", "C3:19.99"]);
  assert.deepEqual(toPush.map((p) => p.code), ["A1", "B2"]);
});
