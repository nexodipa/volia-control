import assert from "node:assert/strict";
import test from "node:test";
import { parseEmails, roleFor } from "../lib/roles.ts";

test("sin lista, todos son editores (comportamiento anterior)", () => {
  assert.equal(roleFor("josue@x.com", undefined), "editor");
  assert.equal(roleFor("josue@x.com", ""), "editor");
  assert.equal(roleFor("josue@x.com", null), "editor");
});
test("quien está en la lista es de solo consulta, sin importar mayúsculas ni separadores", () => {
  const list = " Ana@Volia.com ; pedro@volia.com,\nluis@volia.com ";
  assert.equal(roleFor("ana@volia.com", list), "viewer");
  assert.equal(roleFor("PEDRO@volia.com", list), "viewer");
  assert.equal(roleFor("luis@volia.com", list), "viewer");
  assert.equal(roleFor("josue@volia.com", list), "editor");
});
test("no hay coincidencias parciales ni entradas basura", () => {
  assert.deepEqual(parseEmails("ana@volia.com, basura, ,x"), ["ana@volia.com"]);
  assert.equal(roleFor("ana@volia.com.ec", "ana@volia.com"), "editor");
  assert.equal(roleFor("xana@volia.com", "ana@volia.com"), "editor");
});
