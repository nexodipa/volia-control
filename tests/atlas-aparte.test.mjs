import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = new URL("..", import.meta.url).pathname;

test("el Atlas aparte se compila y su catálogo público no lleva precios, cantidades ni contratistas", () => {
  const res = spawnSync(process.execPath, ["scripts/build-atlas.mjs"], { cwd: root, encoding: "utf8" });
  assert.equal(res.status, 0, res.stderr || res.stdout);
  const dataPath = `${root}atlas-aparte/dist/data/hecam-catalogo.json`;
  assert.ok(existsSync(dataPath), "falta el catálogo público");
  const data = JSON.parse(readFileSync(dataPath, "utf8"));
  assert.ok(data.items.length > 1000);
  for (const item of data.items) {
    assert.deepEqual(Object.keys(item).filter((k) => !["c", "n", "u", "e"].includes(k)), [], `campos de más en ${item.c}`);
  }
  // El catálogo con precios no debe viajar dentro del Atlas aparte.
  assert.ok(!existsSync(`${root}atlas-aparte/dist/data/hecam-2026.json`));
  assert.ok(existsSync(`${root}atlas-aparte/dist/index.html`));
  assert.ok(existsSync(`${root}atlas-aparte/dist/manifest.webmanifest`));
  assert.ok(readdirSync(`${root}atlas-aparte/dist/assets`).some((f) => /^osteo-scene-femur/.test(f)), "falta la escena del fémur");
});

test("el Worker del Atlas aparte solo sirve archivos estáticos y es independiente de Volia Control", () => {
  const cfg = readFileSync(`${root}wrangler.atlas.jsonc`, "utf8");
  assert.match(cfg, /"name":\s*"volia-atlas"/);
  assert.match(cfg, /"directory":\s*"\.\/atlas-aparte\/dist"/);
  assert.doesNotMatch(cfg, /d1_databases|r2_buckets|"main"|triggers/);
});
