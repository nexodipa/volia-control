import assert from "node:assert/strict";
import test from "node:test";
import { amountOf, buyerOptions, buyerRanking, compareWithAward, filterProcesses, ourRecord, provinceCounts, provinceOf, winnerRanking } from "../lib/market.ts";

const P = (o) => ({ id: "x", d: "2026-01-01", b: "H1", m: "SIE", s: "active", c: "insumos", t: "", p: null, o: 0, w: "", a: null, vb: false, vw: false, ...o });
const list = [
  P({ id: "1", b: "GAD DMQ", t: "Dispositivos médicos de uso general", w: "VOLIA S.A.S.", a: 24788.21, vb: true, vw: true, o: 2 }),
  P({ id: "2", b: "GAD DMQ", t: "Dispositivos médicos de uso general", w: "PRODIMEDA", a: 10830, vb: true, o: 4 }),
  P({ id: "3", b: "HE-1", c: "trauma", t: "Prótesis de cadera", w: "QUALIMED", a: 28300, vb: true, o: 7 }),
  P({ id: "4", b: "HE-1", c: "trauma", t: "Osteosíntesis", vb: true, o: 5 }),
  P({ id: "5", b: "HCAM", t: "Jeringas", w: "PRODIMEDA / B.BRAUN", a: 1000, o: 3 }),
];

test("our record separates won, lost and pending", () => {
  const r = ourRecord(list);
  assert.deepEqual([r.bids, r.won, r.lost, r.pending], [4, 1, 2, 1]);
  assert.equal(r.winRate, 33.3);
  assert.equal(r.wonAmount, 24788.21);
  assert.equal(r.lostTo[0].count, 1);
});

test("filters by category, text without accents, and our bids", () => {
  assert.equal(filterProcesses(list, { category: "trauma" }).length, 2);
  assert.equal(filterProcesses(list, { query: "protesis" }).length, 1);
  assert.equal(filterProcesses(list, { onlyOurs: true }).length, 4);
});

test("rankings split shared awards and average tenderers", () => {
  const w = winnerRanking(list);
  assert.equal(w[0].name, "QUALIMED");
  assert.equal(w.find((x) => x.name === "PRODIMEDA").amount, 11330);
  const b = buyerRanking(list);
  assert.equal(b[0].buyer, "GAD DMQ");
  assert.equal(b[0].avgTenderers, 3);
});

test("compare with award: informe de necesidad vs Prodimeda's winning bid", () => {
  const r = compareWithAward(1_021_934, 1_977_924, 1_083_000);
  assert.equal(r.belowOurCost, false);
  assert.equal(r.awardOverCostPct, 6);
  assert.equal(r.gapPct, 82.6);
  assert.match(r.verdict, /muy por encima/);
  assert.equal(compareWithAward(1000, 1100, 900).belowOurCost, true);
});

import { buyerProfile, pricingRisk } from "../lib/market.ts";

test("buyer profile matches by words without accents", () => {
  const prof = buyerProfile(list, "gad dmq");
  assert.equal(prof.processes, 2);
  assert.equal(prof.ourBids, 2);
  assert.equal(prof.ourWins, 1);
  assert.equal(buyerProfile(list, "xyz"), null);
  assert.equal(buyerProfile(list, "no existe nadie"), null);
});

test("pricing risk flags high margins against strong competition", () => {
  assert.equal(pricingRisk(48.3, 4).level, "alto");
  assert.equal(pricingRisk(33, 3.7).level, "medio");
  assert.equal(pricingRisk(20, 5), null);
  assert.equal(pricingRisk(60, 1.5), null);
  assert.equal(pricingRisk(50, null), null);
});

test("amount threshold uses the award, falling back to the reference budget", () => {
  assert.equal(amountOf(P({ a: 5, p: 99 })), 5);
  assert.equal(amountOf(P({ a: null, p: 99 })), 99);
  assert.equal(filterProcesses(list, { minAmount: 10000 }).length, 3);
  assert.equal(filterProcesses(list, { minAmount: 25000 }).length, 1);
  assert.equal(filterProcesses([P({ id: "9", p: 60000 })], { minAmount: 50000 }).length, 1);
});

test("buyer and winner filters match exactly", () => {
  assert.equal(filterProcesses(list, { buyer: "HE-1" }).length, 2);
  assert.equal(filterProcesses(list, { buyer: "HE" }).length, 0);
  assert.deepEqual(filterProcesses(list, { winner: "PRODIMEDA" }).map((p) => p.id), ["2", "5"]);
  assert.equal(filterProcesses(list, { winner: "B.BRAUN" }).length, 1);
  assert.deepEqual(buyerOptions(list).map((b) => b.name), ["GAD DMQ", "HCAM", "HE-1"]);
});

test("province comes from the source, else from the buyer name, else empty", () => {
  assert.equal(provinceOf(P({ b: "HOSPITAL X", r: "AZUAY" })), "Azuay");
  assert.equal(provinceOf(P({ b: "HOSPITAL X", r: "NAPO" })), "Napo");
  assert.equal(provinceOf(P({ b: "H", r: "SANTA ELENA" })), "Santa Elena");
  assert.equal(provinceOf(P({ b: "HOSPITAL GENERAL DOCENTE DE AMBATO" })), "Tungurahua");
  assert.equal(provinceOf(P({ b: "HOSPITAL NAVAL GUAYAQUIL" })), "Guayas");
  assert.equal(provinceOf(P({ b: "HOSPITAL DE ESPECIALIDADES CARLOS ANDRADE MARIN" })), "Pichincha");
  assert.equal(provinceOf(P({ b: "Hospital Eugenio Espejo" })), "Pichincha");
  assert.equal(provinceOf(P({ b: "INSTITUTO ECUATORIANO DE SEGURIDAD SOCIAL" })), "");
  assert.equal(provinceOf(P({ b: "MANTARAYA" })), "");
  const l = [P({ id: "a", b: "HOSPITAL DE LOJA" }), P({ id: "b", b: "CLINICA QUITO" }), P({ id: "c", b: "SIN CIUDAD" }), P({ id: "d", b: "H", r: "Loja" })];
  assert.deepEqual(provinceCounts(l), [{ name: "Loja", count: 2 }, { name: "Pichincha", count: 1 }]);
  assert.equal(filterProcesses(l, { province: "Loja" }).length, 2);
});
