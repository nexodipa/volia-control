import assert from "node:assert/strict";
import test from "node:test";
import { itemsToText, joinHyphenated, splitText, looksEnglish, cleanModelOutput, buildTranslationPrompt } from "../lib/translate.ts";

const it = (str, x, y, h = 10) => ({ str, transform: [1, 0, 0, h, x, y], height: h });

test("agrupa fragmentos por línea y separa párrafos por el hueco vertical", () => {
  const t = itemsToText([it("Sterile", 10, 700), it("single use", 60, 700), it("Next paragraph", 10, 660), it("tight", 10, 648)]);
  assert.equal(t, "Sterile single use\n\nNext paragraph\ntight");
});
test("une palabras cortadas con guion", () => {
  assert.equal(joinHyphenated("informa-\ntion about"), "information about");
  assert.equal(joinHyphenated("well-\nKnown"), "well-\nKnown");
});
test("splitText respeta el máximo y no pierde texto", () => {
  const para = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
  const text = `${para}\n\n${para}\n\nShort end.`;
  const parts = splitText(text, 500);
  assert.ok(parts.every((p) => p.length <= 500));
  assert.equal(parts.join(" ").replace(/\s+/g, " "), text.replace(/\s+/g, " "));
  assert.deepEqual(splitText("   "), []);
  assert.deepEqual(splitText("hola"), ["hola"]);
});
test("detecta inglés vs español", () => {
  assert.equal(looksEnglish("The device is sterile and for single use only, with the labelling in this box and the manual of the user to be read before use of the product by staff"), true);
  assert.equal(looksEnglish("El dispositivo es estéril y de un solo uso, con la etiqueta en la caja y el manual del usuario para leer antes de usar el producto por el personal de la sala"), false);
});
test("limpia la salida del modelo y arma la instrucción", () => {
  assert.equal(cleanModelOutput("```\nHola\n```"), "Hola");
  assert.match(buildTranslationPrompt("x"), /español de Ecuador[\s\S]*TEXTO:\nx$/);
});

import { reflow } from "../lib/translate.ts";
test("reflow une renglones cortados pero respeta párrafos y viñetas", () => {
  const t = "The titanium bone plate is supplied sterile and is intended for\nsingle use only.\n\n- Item one\n- Item two\nCatalog: TP-2045\nShort title\nNext line here.";
  assert.equal(reflow(t), "The titanium bone plate is supplied sterile and is intended for single use only.\n\n- Item one\n- Item two\nCatalog: TP-2045\nShort title\nNext line here.");
});
