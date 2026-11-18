import assert from "node:assert/strict";
import test from "node:test";
import { demandRates, reorderPlan, expiringLots, stockDigest, reorderList, productKey } from "../lib/stock-plan.ts";
import { buildDigest } from "../lib/alert-digest.ts";

const MON = "2026-11-23";
const WED = "2026-11-25";
const item = (o = {}) => ({ id: "i1", code: "C1", product: "SUTURA", lot: "L1", expiry: "2028-01-01", stock: 10, reserved: 0, minimum: 2, unitCost: 5, ...o });
const mv = (o = {}) => ({ date: "2026-11-10", type: "sale", itemId: "i1", code: "C1", product: "SUTURA", quantity: 6, ...o });

test("only sales and surgeries count as demand, inside the 90 day window", () => {
  const rates = demandRates([item()], [mv(), mv({ type: "loss", quantity: 50 }), mv({ type: "expired", quantity: 50 }), mv({ date: "2026-05-01", quantity: 50 }), mv({ date: "2026-12-01", quantity: 50 })], MON);
  assert.equal(rates.size, 1);
  // 6 unidades; primer movimiento hace 13 días: la ventana mínima es de 30 días
  assert.equal(rates.get(productKey("C1", "SUTURA")), 6 / 30);
});

test("a movement is matched to its product by item id, or by code and name if the id is gone", () => {
  assert.equal(demandRates([item()], [mv({ itemId: "otro", code: "c1" })], MON).size, 1);
  assert.equal(demandRates([item()], [mv({ itemId: "otro", code: "", product: "sutura" })], MON).size, 1);
});

test("reorder stages: agotado, bajo el mínimo and alcanza poco", () => {
  const items = [item({ id: "a", code: "A", product: "A", stock: 0 }), item({ id: "b", code: "B", product: "B", stock: 2 }), item({ id: "c", code: "C", product: "C", stock: 12 }), item({ id: "d", code: "D", product: "D", stock: 50 })];
  const moves = [mv({ itemId: "c", code: "C", product: "C", quantity: 30 })];
  const plan = reorderPlan(items, moves, MON);
  assert.deepEqual(plan.map((r) => [r.product, r.stage]), [["A", "agotado"], ["B", "bajo"], ["C", "pronto"]]);
  // C: 30 u. en 30 días = 1/día; 12 disponibles = 12 días. Meta: 60 + mínimo 2 - 12 = 50
  const c = plan.find((r) => r.product === "C");
  assert.equal(Math.floor(c.coverDays), 12);
  assert.equal(c.suggested, 50);
  // B sin consumo: se lleva a 2 veces el mínimo
  assert.equal(plan.find((r) => r.product === "B").suggested, 2);
});

test("reserved and expired units are not usable", () => {
  const plan = reorderPlan([item({ stock: 10, reserved: 9 }), item({ id: "x", lot: "L2", stock: 100, expiry: "2026-11-01" })], [], MON);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].usable, 1);
  assert.equal(plan[0].stage, "bajo");
});

test("a product with no minimum and no consumption is not flagged when empty", () => {
  assert.equal(reorderPlan([item({ stock: 0, minimum: 0 })], [], MON).length, 0);
  assert.equal(reorderPlan([item({ stock: 0, minimum: 0 })], [mv()], MON).length, 1);
});

test("lots of one product share the minimum and the demand", () => {
  const items = [item({ id: "a", lot: "L1", stock: 3 }), item({ id: "b", lot: "L2", stock: 3 })];
  assert.equal(reorderPlan(items, [], MON).length, 0);
  assert.equal(reorderPlan(items, [mv({ itemId: "a", quantity: 60 })], MON)[0].stage, "pronto");
});

test("expiring lots: expired, window edge and FEFO surplus", () => {
  const items = [
    item({ id: "a", lot: "VIEJO", stock: 4, expiry: "2026-11-20" }),
    item({ id: "b", lot: "PRONTO", stock: 20, expiry: "2026-12-23" }),
    item({ id: "c", lot: "LUEGO", stock: 20, expiry: "2027-06-01" }),
    item({ id: "d", lot: "LIMITE", stock: 5, expiry: "2027-02-21", code: "Z", product: "Z" }),
    item({ id: "e", lot: "FUERA", stock: 5, expiry: "2027-02-22", code: "Y", product: "Y" }),
  ];
  const lots = expiringLots(items, [mv({ itemId: "b", quantity: 30 })], MON);
  assert.deepEqual(lots.map((l) => l.item.lot), ["VIEJO", "PRONTO", "LIMITE"]);
  assert.equal(lots[0].days, -3);
  // 1 u./día durante 30 días vende 30 u., pero el lote PRONTO solo tiene 20: no sobra nada
  assert.equal(lots[1].surplus, 0);
  assert.equal(lots[2].surplus, null);
});

test("FEFO: the earlier lot is sold first, so the later one inherits the shortfall", () => {
  const items = [item({ id: "a", lot: "A", stock: 10, expiry: "2026-12-23" }), item({ id: "b", lot: "B", stock: 10, expiry: "2027-01-12" })];
  // 0,5 u./día: en 30 días se venden 15; el lote A (10) sale completo y B vende 5 de 10 en sus 50 días: 25 posibles
  const lots = expiringLots(items, [mv({ itemId: "a", quantity: 15 })], MON);
  assert.equal(lots[0].surplus, 0);
  assert.equal(lots[1].surplus, 0);
  const slow = expiringLots(items, [mv({ itemId: "a", quantity: 3 })], MON);
  assert.equal(slow[0].surplus, 7);
});

test("digest: Monday lists everything, other weekdays only marks and ran-out items on Wednesday", () => {
  const items = [item({ id: "a", lot: "A", stock: 5, expiry: "2026-12-23" }), item({ id: "b", code: "B", product: "B", lot: "B", stock: 0, expiry: "" })];
  const moves = [mv({ itemId: "b", code: "B", product: "B", quantity: 3 })];
  const mon = stockDigest(items, moves, MON, true);
  assert.equal(mon.expiry.total, 1);
  assert.equal(mon.reorder.total, 1);
  assert.match(mon.reorder.lines[0], /agotado/);
  const tue = stockDigest(items, moves, "2026-11-24", false);
  assert.equal(tue.expiry.total, 0);
  assert.equal(tue.reorder.total, 0);
  assert.equal(stockDigest(items, moves, WED, false).reorder.total, 1);
  // el lote cumple 30 días exactos el 23 de noviembre
  assert.equal(stockDigest(items, moves, MON, false).expiry.total, 1);
  // vencido ayer sí, vencido hace dos días no
  assert.equal(stockDigest([item({ expiry: "2026-11-23" })], [], "2026-11-24", false).expiry.total, 1);
  assert.equal(stockDigest([item({ expiry: "2026-11-23" })], [], "2026-11-25", false).expiry.total, 0);
});

test("digest sections and counts reach the email, and nothing else means no email", () => {
  const stock = { items: [item({ stock: 1 })], moves: [] };
  const d = buildDigest([], [], MON, "https://x.example", [], [], stock);
  assert.ok(d);
  assert.equal(d.counts.reposicion, 1);
  assert.match(d.text, /Reposición sugerida \(1\)/);
  assert.match(d.subject, /1 producto\(s\) por reponer/);
  assert.equal(buildDigest([], [], MON, "https://x.example", [], [], { items: [item()], moves: [] }), null);
});

test("long lists are capped", () => {
  const items = Array.from({ length: 20 }, (_, n) => item({ id: `i${n}`, code: `C${n}`, product: `P${n}`, stock: 0 }));
  const r = stockDigest(items, [], MON, true).reorder;
  assert.equal(r.total, 20);
  assert.equal(r.lines.length, 13);
  assert.match(r.lines[12], /y 8 más/);
});

test("the copyable list carries product, quantity and the caveat", () => {
  const txt = reorderList(reorderPlan([item({ stock: 0 })], [], MON), MON);
  assert.match(txt, /SUTURA \(C1\): unas 4 u\./);
  assert.match(txt, /orientativas/);
  assert.equal(reorderList([], MON), "");
});
