import assert from "node:assert/strict";
import test from "node:test";
import { matchLines, parseRequirementText, rememberAlias } from "../lib/requirement-import.ts";

test("parses rows pasted from the informe de necesidad (tab separated)", () => {
  const pasted = [
    "No.\tCPC (nivel 9)\tProducto\tCUDIM\tEspecificaciones Técnicas\tCantidad\tUnidad de Medida",
    "3\t352901091\tAguja hipodérmica, 23 G, 1\" - 1 1/2\"\t12-745-009\tCalibre 23 G, acero inoxidable\t628\tUNIDAD",
    "22\t352901091\tJeringa 3 ml, 21 G, 1 \"\t13-940-014\tPolipropileno, con aguja 21 G\t629\tUNIDAD",
  ].join("\n");
  const lines = parseRequirementText(pasted);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].text, "Aguja hipodérmica, 23 G, 1\" - 1 1/2\"");
  assert.equal(lines[0].quantity, 628);
  assert.equal(lines[1].quantity, 629);
});

test("parses free text lines", () => {
  const lines = parseRequirementText("10 placas LCP anatómicas\nTornillo de cortical x 24\nBroca desechable");
  assert.deepEqual(lines.map((l) => [l.text, l.quantity]), [["placas LCP anatómicas", 10], ["Tornillo de cortical", 24], ["Broca desechable", 1]]);
});

const catalog = [
  { code: "3433461002033", description: "PLACA LCP ANATÓMICA" },
  { code: "3433461002039", description: "TORNILLO DE CORTICAL" },
  { code: "3433461002040", description: "BROCA DESECHABLE" },
];

test("similar matches are only proposed; confirmed ones apply by customer", () => {
  const lines = parseRequirementText("Placa LCP anatómica\nBroca desechable estéril\nGuantes de examinación");
  const first = matchLines(lines, catalog, [], "Hospital Eugenio Espejo");
  assert.deepEqual(first.map((m) => m.via), ["similar", "similar", "none"]);
  assert.equal(first[0].code, null);
  assert.equal(first[0].candidates[0].code, "3433461002033");
  const aliases = rememberAlias([], "Placa LCP anatómica", "Hospital Eugenio Espejo", "3433461002033");
  const again = matchLines(lines, catalog, aliases, "HOSPITAL EUGENIO ESPEJO");
  assert.equal(again[0].via, "alias");
  assert.equal(again[0].code, "3433461002033");
  assert.equal(matchLines(lines, catalog, aliases, "Otro hospital")[0].via, "similar");
});

test("an alias to a product no longer in the catalog is ignored", () => {
  const aliases = rememberAlias([], "Placa LCP anatómica", "", "NO-EXISTE");
  assert.equal(matchLines(parseRequirementText("Placa LCP anatómica"), catalog, aliases, "")[0].via, "similar");
});
