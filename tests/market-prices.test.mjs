import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { findMarketPrice, pricePosition, bestNameMatch, contains } from "../lib/market-prices.ts";

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

test("contains: one description must contain the other, word by word", () => {
  assert.equal(contains("TUBO ENDOTRAQUEAL C/BALON 8,5MM", "Tubo intercambiador para intubación endotraqueal"), false);
  assert.equal(contains("GUANTE DE EXAMINACION S/P TALLA S", "Guantes de látex, talla grande"), false);
  assert.equal(contains("TRANSOFIX", "Transferrina"), false); // raíces iguales de 5 letras, palabras distintas
  assert.equal(contains("SUPERFILLER", "Indicador biológico, lectura super rápida"), false);
  assert.equal(contains("Llave de tres vias", "Llave de 3 vías"), true); // las cifras no cuentan; las medidas las revisa measures
  assert.equal(contains("Guante de examinación", "Guantes de examinación talla M"), true); // plural
  assert.equal(contains("SONDA NELATON 12CH", "Sonda Nélaton, 12 Fr, mínimo 38 cm de longitud"), true); // CH = Fr
});

test("contains: 'con X' against 'sin X' is a different product", () => {
  assert.equal(contains("TUBO TORACICO CON TROCAR 12 CH", "Tubo torácico, 12 Fr., sin trócar"), false);
  assert.equal(contains("TUBO ENDOTRAQUEAL S/BALON 4,0MM", "Tubo endotraqueal I.D. 4.0 mm, con balón"), false);
  assert.equal(contains("TUBO ENDOTRAQUEAL C/BALON 4,0MM", "Tubo endotraqueal I.D. 4.0 mm, con balón"), true);
});

test("bestNameMatch with contain skips the partial match and finds the right item", () => {
  const items = [{ n: "Tubo intercambiador para intubación endotraqueal" }, { n: "Tubo endotraqueal I.D. 8.5 mm, con balón" }];
  const loose = bestNameMatch("TUBO ENDOTRAQUEAL C/BALON 8,5MM", items, (i) => i.n, { strict: true, minScore: 0.5 });
  const tight = bestNameMatch("TUBO ENDOTRAQUEAL C/BALON 8,5MM", items, (i) => i.n, { strict: true, minScore: 0.5, contain: true });
  assert.ok(loose); // sin la regla se aceptaba un candidato parcial
  assert.equal(tight.value.n, "Tubo endotraqueal I.D. 8.5 mm, con balón");
  assert.equal(bestNameMatch("GUANTE DE EXAMINACION S/P TALLA S", [{ n: "Guantes de látex, talla grande" }], (i) => i.n, { strict: true, minScore: 0.5, contain: true }), null);
});
