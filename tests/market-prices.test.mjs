import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { findMarketPrice, pricePosition } from "../lib/market-prices.ts";

const items = JSON.parse(readFileSync(new URL("../public/data/precios-mercado-items.json", import.meta.url), "utf8")).items;
const m = (d) => findMarketPrice(d, items)?.item.item ?? null;

test("sizes must match: syringes and gloves go to their own item", () => {
  assert.match(m("Jeringa 10 ml, 21 G, 1\" - 1 1/2\""), /^Jeringa 10 ml/);
  assert.match(m("Jeringa 3 ml, 21 G, 1\""), /^Jeringa 3 ml/);
  assert.match(m("Guantes quirúrgicos N° 7.5"), /7\.5/);
  assert.match(m("Guantes quirúrgicos N°6,5"), /6\.5/);
});

test("head noun rule and no false friends", () => {
  assert.equal(m("Ácido acético 5%"), null); // no es tricloroacético
  assert.match(m("Equipo micro gotero"), /microgotero/);
  assert.equal(m("Tornillo cortical 3.5 mm"), null);
  assert.match(m("Tira reactiva para medición de glucosa"), /glucosa/);
});

test("price position against the market", () => {
  const item = { mediana: 0.09, p25: 0.06, p75: 0.1 };
  assert.equal(pricePosition(0.25, 0.125, item).position, "muy-alto");
  assert.equal(pricePosition(0.25, 0.125, item).costAboveMedian, true);
  assert.equal(pricePosition(0.08, 0.05, item).position, "competitivo");
  assert.equal(pricePosition(0.05, 0.04, item).position, "bajo-mercado");
});
