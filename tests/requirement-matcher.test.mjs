import assert from "node:assert/strict";
import test from "node:test";

import { matchRequirement, normalizeRequirementText, similarity } from "../lib/requirement-matcher.ts";

const catalog = [
  { id: 1, code: "A23", name: "Aguja hipodérmica 23 G 1 1/2 pulgadas" },
  { id: 2, code: "A21", name: "Aguja hipodérmica 21 G 1 1/2 pulgadas" },
  { id: 3, code: "ALG", name: "Algodón hidrófilo torundas paquete x 500" },
];

test("normalizes accents, decimal commas and punctuation", () => {
  assert.equal(normalizeRequirementText("Tornillo, 1,5 MM – Cortical"), "tornillo 1.5 mm cortical");
});

test("a confirmed alias is applied automatically and scoped by customer", () => {
  const aliases = [
    { normalizedText: normalizeRequirementText("AGUJA 23G HOSP"), customerKey: "hospital-x", productId: 1 },
  ];
  const hit = matchRequirement("Aguja 23G hosp", catalog, aliases, { customerKey: "hospital-x" });
  assert.equal(hit.via, "alias");
  assert.equal(hit.productId, 1);

  const other = matchRequirement("Aguja 23G hosp", catalog, aliases, { customerKey: "otro" });
  assert.equal(other.via, "none");
});

test("a similar match is only proposed, never applied automatically", () => {
  const result = matchRequirement("Algodón hidrófilo en torundas, paquete x 500", catalog, []);
  assert.equal(result.via, "similar");
  assert.equal(result.productId, null);
  assert.equal(result.candidates[0].productId, 3);
});

test("a different gauge is never offered as a substitute", () => {
  assert.equal(similarity("Aguja hipodérmica 21 G 1 1/2", catalog[0].name), 0);
  const result = matchRequirement("Aguja hipodérmica 23 G 1 1/2", catalog, []);
  assert.deepEqual(result.candidates.map((c) => c.productId), [1]);
});

test("unrelated text returns no candidates", () => {
  assert.equal(matchRequirement("Guante quirúrgico talla 7.5", catalog, []).via, "none");
});

test("singular and plural count as the same word, but measures still block", () => {
  assert.ok(similarity("Guantes de examen talla M", "Guante de examen talla M") >= 0.99);
  assert.ok(similarity("Jeringas 10 ml", "Jeringa 10 ml") >= 0.99);
  assert.equal(similarity("Jeringas 10 ml", "Jeringa 3 ml"), 0);
});
