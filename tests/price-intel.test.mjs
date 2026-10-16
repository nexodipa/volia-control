import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { costAboveMarket, marketReference, supplierOffers } from "../lib/price-intel.ts";

const load = (f) => JSON.parse(readFileSync(new URL(`../public/data/${f}`, import.meta.url), "utf8")).items;
const data = { market: load("precios-mercado-items.json"), hecam: load("hecam-2026.json"), suppliers: load("costos-proveedores.json") };

test("market reference prefers SOCE median, falls back to HECAM", () => {
  const r = marketReference("Jeringa 10 ml, 21 G, 1\" - 1 1/2\"", data);
  assert.equal(r.source, "mercado");
  assert.ok(costAboveMarket(0.125, r));
  const h = marketReference("Acetábulo de revisión no cementado", data);
  assert.ok(h && h.source.startsWith("hecam"));
});

test("supplier offers are sorted and come from the price lists", () => {
  const offers = supplierOffers("Catéter de succión con control de vacío 08 CH", data.suppliers);
  assert.ok(offers.length >= 1);
  assert.equal(offers[0].item.p, "Trademedsa");
  for (let i = 1; i < offers.length; i++) assert.ok(offers[i - 1].price <= offers[i].price);
});
