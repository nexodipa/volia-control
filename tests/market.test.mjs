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
  for (const [raw, want] of [["MANABI", "Manabí"], ["LOS RIOS", "Los Ríos"], ["CAÑAR", "Cañar"], ["GALAPAGOS", "Galápagos"], ["SUCUMBIOS", "Sucumbíos"], ["ZAMORA CHINCHIPE", "Zamora Chinchipe"], ["MORONA SANTIAGO", "Morona Santiago"]]) assert.equal(provinceOf(P({ b: "H", r: raw })), want);
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

test("totales por mes: ordenados, con etiqueta en español y sin fechas inválidas", async () => {
  const { monthlyTotals } = await import("../lib/market.ts");
  const mk = (d, a) => ({ id: d + a, d, b: "H", m: "SIE", s: "active", c: "insumos", t: "", p: null, o: 1, w: "X", a, vb: false, vw: false });
  const out = monthlyTotals([mk("2026-03-05", 100), mk("2026-01-20", 50), mk("2026-03-28", 25), mk("sin fecha", 999), mk("2026-02-01", null)]);
  assert.deepEqual(out.map((m) => [m.month, m.label, m.count, m.amount]), [["2026-01", "ene", 1, 50], ["2026-02", "feb", 1, 0], ["2026-03", "mar", 2, 125]]);
});

test("competencia: reparte en 1, 2, 3 a 5 y 6 o más, e ignora los que no informan oferentes", async () => {
  const { competitionBuckets } = await import("../lib/market.ts");
  const mk = (o) => ({ id: "x" + o, d: "2026-01-01", b: "H", m: "SIE", s: "active", c: "insumos", t: "", p: null, o, w: "", a: null, vb: false, vw: false });
  const out = competitionBuckets([1, 1, 2, 3, 5, 6, 12, 0].map(mk));
  assert.deepEqual(out.map((b) => b.count), [2, 1, 2, 2]);
});

test("provincias por monto: ordena, limita y salta las que no tienen provincia", async () => {
  const { provinceTotals } = await import("../lib/market.ts");
  const mk = (r, a, b = "HOSPITAL X") => ({ id: r + a, d: "2026-01-01", b, m: "SIE", s: "active", c: "insumos", t: "", p: null, o: 1, w: "", a, vb: false, vw: false, r });
  const out = provinceTotals([mk("PICHINCHA", 100), mk("GUAYAS", 500), mk("PICHINCHA", 300), mk(undefined, 9999, "ENTIDAD SIN CIUDAD")], 2);
  assert.deepEqual(out.map((p) => [p.name, p.count, p.amount]), [["Guayas", 1, 500], ["Pichincha", 2, 400]]);
});

import { activeFilters, clearFilterKey, facetOptions, filterProcesses as fp2, sortProcesses, usualSegment, voliaProfile } from "../lib/market.ts";

const mk = (o) => ({ id: "X", d: "2026-05-10", b: "HOSPITAL A QUITO", m: "SIE", s: "complete", c: "insumos", t: "t", p: null, o: 3, w: "ACME", a: 50000, vb: false, vw: false, r: "PICHINCHA", ...o });

test("filtros numéricos: monto máximo, oferentes, método, estado y período; lo desconocido no se cuela", () => {
  const list = [mk({ id: "1", a: 20000, o: 2 }), mk({ id: "2", a: 80000, o: 6, m: "LIC" }), mk({ id: "3", a: null, p: null, o: 0, w: "" }), mk({ id: "4", a: 30000, o: 3, d: "2026-09-01" })];
  const ids = (f) => fp2(list, f).map((p) => p.id);
  assert.deepEqual(ids({ maxAmount: 40000 }), ["1", "4"], "sin monto conocido no entra bajo un máximo");
  assert.deepEqual(ids({ minTenderers: 3, maxTenderers: 6 }), ["2", "4"]);
  assert.deepEqual(ids({ maxTenderers: 2 }), ["1"], "sin oferentes informados no cuenta como 'pocos'");
  assert.deepEqual(ids({ methods: ["LIC"] }), ["2"]);
  assert.deepEqual(ids({ awarded: "no" }), ["3"]);
  assert.deepEqual(ids({ awarded: "si" }), ["1", "2", "4"]);
  assert.deepEqual(ids({ from: "2026-08" }), ["4"]);
  assert.deepEqual(ids({ to: "2026-06" }), ["1", "2", "3"]);
});

test("facetas: los hospitales ofrecidos dependen de la provincia elegida y los conteos respetan los demás filtros", () => {
  const list = [mk({ id: "1", b: "H QUITO", r: "PICHINCHA" }), mk({ id: "2", b: "H QUITO", r: "PICHINCHA" }), mk({ id: "3", b: "H GUAYAQUIL", r: "GUAYAS" }), mk({ id: "4", b: "H IBARRA", r: "IMBABURA", c: "trauma" })];
  assert.deepEqual(facetOptions(list, { provinces: ["Pichincha"] }, "buyer"), [{ name: "H QUITO", count: 2 }]);
  assert.deepEqual(facetOptions(list, { provinces: ["Pichincha"] }, "province").map((x) => x.name), ["Pichincha", "Guayas", "Imbabura"], "la propia faceta no se filtra a sí misma");
  assert.deepEqual(facetOptions(list, { category: "trauma" }, "province"), [{ name: "Imbabura", count: 1 }]);
});

test("perfil de Volia: métodos, provincias repetidas y rango central de montos; segmento habitual", () => {
  const list = [
    mk({ id: "a", vb: true, a: 10000, r: "PICHINCHA" }), mk({ id: "b", vb: true, a: 30000, r: "PICHINCHA" }), mk({ id: "c", vb: true, a: 60000, r: "CHIMBORAZO" }),
    mk({ id: "d", vb: true, a: 90000, r: "CHIMBORAZO" }), mk({ id: "e", vb: true, a: 1500000, r: "NAPO" }), mk({ id: "z", a: 40000 }),
  ];
  const prof = voliaProfile(list);
  assert.equal(prof.bids, 5);
  assert.deepEqual(prof.methods, ["SIE"]);
  assert.deepEqual(prof.provinces.map((p) => p.name), ["Pichincha", "Chimborazo", "Napo"]);
  assert.equal(prof.amountLow, 30000);
  assert.equal(prof.amountHigh, 90000);
  const seg = usualSegment(prof);
  assert.deepEqual(seg.provinces, ["Pichincha", "Chimborazo"]);
  assert.deepEqual(fp2(list, seg).map((p) => p.id), ["b", "c", "d", "z"], "z (Pichincha, 40 mil, SIE) también encaja");
  assert.equal(voliaProfile([mk({})]), null);
});

test("ordenar, describir filtros activos y quitarlos por grupo", () => {
  const list = [mk({ id: "1", a: 10, o: 9, d: "2026-01-01" }), mk({ id: "2", a: 30, o: 1, d: "2026-03-01" }), mk({ id: "3", a: 20, o: 5, d: "2026-02-01" })];
  assert.deepEqual(sortProcesses(list, "monto").map((p) => p.id), ["2", "3", "1"]);
  assert.deepEqual(sortProcesses(list, "fecha").map((p) => p.id), ["2", "3", "1"]);
  assert.deepEqual(sortProcesses(list, "oferentes").map((p) => p.id), ["1", "3", "2"]);
  const f = { category: "trauma", provinces: ["Pichincha"], minAmount: 20000, maxAmount: 250000, minTenderers: 3 };
  assert.deepEqual(activeFilters(f).map((x) => x.label), ["Traumatología", "Pichincha", "$20 mil a $250 mil", "3 o más oferentes"]);
  const cleared = clearFilterKey(clearFilterKey(f, "amount"), "provinces");
  assert.deepEqual(activeFilters(cleared).map((x) => x.key), ["category", "tenderers"]);
});

test("parseAmount entiende montos escritos a mano", async () => {
  const { parseAmount } = await import("../lib/market.ts");
  assert.equal(parseAmount("28.000"), 28000);
  assert.equal(parseAmount("1.500,50"), 1500);
  assert.equal(parseAmount("1500.50"), 1500);
  assert.equal(parseAmount("$ 226 000"), 226000);
  assert.equal(parseAmount("1,234,567"), 1234567);
  assert.equal(parseAmount(""), undefined);
  assert.equal(parseAmount("abc"), undefined);
});

test("toggleIn y fixMonthRange", async () => {
  const { toggleIn, fixMonthRange } = await import("../lib/market.ts");
  assert.deepEqual(toggleIn(undefined, "a"), ["a"]);
  assert.deepEqual(toggleIn(["a", "b"], "a"), ["b"]);
  assert.equal(toggleIn(["a"], "a"), undefined);
  assert.deepEqual(fixMonthRange("2026-08", "2026-03", "from"), { from: "2026-08", to: "2026-08" });
  assert.deepEqual(fixMonthRange("2026-08", "2026-03", "to"), { from: "2026-03", to: "2026-03" });
  assert.deepEqual(fixMonthRange("2026-02", "2026-03", "from"), { from: "2026-02", to: "2026-03" });
});

test("las entidades sin provincia publicada se ubican por su nombre", async () => {
  const { provinceOf } = await import("../lib/market.ts");
  const base = { id: "x", d: "2026-01-01", m: "SIE", c: "insumos", t: "", p: null, o: 1, w: "", a: null, vb: false, vw: false };
  assert.equal(provinceOf({ ...base, b: "HOSPITAL BASICO ANCON" }), "Santa Elena");
  assert.equal(provinceOf({ ...base, b: "CENTRO CLINICO HOSPITAL DEL DIA SAMBORONDON" }), "Guayas");
  assert.equal(provinceOf({ ...base, b: "GAD MUNICIPAL DEL CANTON LA CONCORDIA" }), "Santo Domingo de los Tsáchilas");
});

test("freshOpportunities cuenta solo lo reciente que encaja con lo que Volia suele ofertar", async () => {
  const { freshOpportunities } = await import("../lib/market.ts");
  const mk = (id, d, extra = {}) => ({ id, d, b: "HOSPITAL X", m: "SIE", c: "insumos", t: "", p: null, o: 4, w: "", a: 50000, vb: false, vw: false, r: "Pichincha", ...extra });
  const all = [
    mk("a", "2026-01-10", { vb: true }), mk("b", "2026-01-12", { vb: true }), mk("c", "2026-01-15", { vb: true }),
    mk("d", "2026-10-20"), mk("e", "2026-11-01"), mk("f", "2026-11-02", { r: "Galápagos", m: "LIC", a: 900 }), mk("g", "2026-08-01"),
  ];
  const r = freshOpportunities(all, 21);
  assert.ok(r);
  assert.equal(r.since, "2026-10-12");
  assert.equal(r.total, 3);
  assert.equal(r.count, 2);
  assert.equal(freshOpportunities([], 21), null);
  assert.equal(freshOpportunities([mk("z", "2026-11-01")], 21), null);
});

test("el filtro since deja solo lo publicado desde ese día y se puede quitar", async () => {
  const { filterProcesses, activeFilters, clearFilterKey } = await import("../lib/market.ts");
  const mk = (id, d) => ({ id, d, b: "H", m: "SIE", c: "insumos", t: "", p: null, o: 3, w: "", a: 1000, vb: false, vw: false });
  const all = [mk("a", "2026-09-30"), mk("b", "2026-10-01"), mk("c", "2026-10-05")];
  assert.equal(filterProcesses(all, { since: "2026-10-01" }).length, 2);
  assert.ok(activeFilters({ since: "2026-10-01" }).some((c) => c.key === "since"));
  assert.equal(filterProcesses(all, clearFilterKey({ since: "2026-10-01" }, "since")).length, 3);
});
