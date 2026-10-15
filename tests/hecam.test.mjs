import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { contractorRanking, findHecamItem, opportunities } from "../lib/hecam.ts";

const items = JSON.parse(readFileSync(new URL("../public/data/hecam-2026.json", import.meta.url), "utf8")).items;

test("HECAM matching respects sizes", () => {
  assert.match(findHecamItem("Jeringa 10 ml, 21 G, 1\" - 1 1/2\"", items).n, /^Jeringa 10 ml/);
  assert.match(findHecamItem("Guantes quirúrgicos N° 7", items).n, /N° 7$/);
});

test("opportunities: trauma, ínfima cuantía, pending, sorted by budget", () => {
  const list = opportunities(items, { especialidad: "traumatolog", tipo: "Ínfima Cuantía", soloPendientes: true });
  assert.ok(list.length > 30);
  assert.ok(list.every((i) => !i.g && i.t === "Ínfima Cuantía"));
  assert.ok(list[0].prt >= list[1].prt);
});

test("contractor ranking merges name variants", () => {
  const r = contractorRanking(items, 50);
  assert.equal(r.filter((x) => /roche/i.test(x.name)).length, 1);
});
