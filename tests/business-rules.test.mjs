import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { createCsv } from "../lib/csv.ts";
import { businessIsoDate } from "../lib/date-utils.ts";
import { applyStockMovement } from "../lib/inventory-data.ts";
import { auditRecognizedText } from "../lib/local-audit.ts";
import { VOLIA_SYSTEM_PRODUCTS, VOLIA_SYSTEMS } from "../lib/volia-system-catalog.ts";

const stock = {
  id: "test",
  code: "1",
  product: "Producto",
  lot: "L1",
  expiry: "2028-01-01",
  location: "Bodega",
  stock: 10,
  reserved: 4,
  minimum: 2,
  unitCost: 5,
};

test("uses the Quito business date near the UTC day boundary", () => {
  assert.equal(businessIsoDate(new Date("2026-08-19T03:30:00Z")), "2026-08-18");
});

test("neutralizes spreadsheet formulas in CSV exports", () => {
  assert.match(createCsv([["=SUM(A1:A2)", "+cmd", "normal"]]), /^"'=SUM/);
});

test("surgery consumption reduces both physical and reserved stock", () => {
  const result = applyStockMovement(stock, "surgery", 3);
  assert.equal(result.error, "");
  assert.equal(result.next.stock, 7);
  assert.equal(result.next.reserved, 1);
});

test("ordinary exits cannot consume stock reserved for surgery", () => {
  const result = applyStockMovement(stock, "sale", 7);
  assert.match(result.error, /disponible/i);
  assert.deepEqual(result.next, stock);
});

test("auditor reconstructs item totals and IVA from recognized text", () => {
  const result = auditRecognizedText(`
    Paciente: PACIENTE PRUEBA
    CI: 0000000000
    HCL: 0000000
    Fecha de Cirugía: 16/07/2026
    Quito, 17/07/2026
    3433461002033 PLACA LCP ANATÓMICA 1 441,17 441,17
    SUBTOTAL 441,17 IVA 15 % 66,18 TOTAL 507,35
    firmado digitalmente
  `);
  assert.equal(result.calculations.subtotal, 441.17);
  assert.equal(result.calculations.iva, 66.18);
  assert.equal(result.calculations.total, 507.35);
});

test("loads the Excel system catalog with editable suggested quantities", () => {
  assert.equal(VOLIA_SYSTEMS.length, 73);
  assert.ok(VOLIA_SYSTEM_PRODUCTS.length >= 100);

  const system = VOLIA_SYSTEMS.find((entry) =>
    entry.name === "SISTEMA DE PLACA EN T 3 ORI CABEZA DE 1,5"
  );
  assert.ok(system);
  assert.deepEqual(
    system.items.map((item) => [item.code, item.suggestedQuantity, item.unitPrice]),
    [
      ["F14AB-PA01329", 1, 300],
      ["F14DB-PA01029", 5, 25],
      ["F14CB-PA00484", 3, 30],
    ],
  );
  assert.equal(
    VOLIA_SYSTEM_PRODUCTS.some((product) => product.description === "#NAME?"),
    false,
  );
});

test("ships an installable offline app with branded icons", () => {
  const manifest = JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf8"));
  const serviceWorker = fs.readFileSync("public/service-worker.js", "utf8");

  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.id, "/");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
  assert.ok(fs.statSync("public/app-icon-512.png").size > 0);
  assert.match(serviceWorker, /precacheApplication/);
  assert.match(serviceWorker, /event\.request\.mode === "navigate"/);
});
