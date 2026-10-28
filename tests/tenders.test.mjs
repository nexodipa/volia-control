import assert from "node:assert/strict";
import test from "node:test";
import { deadlineReminders, followLink, normalizeTender, sortTenders, tenderFromParams, tenderStats } from "../lib/tenders.ts";
import { buildDigest } from "../lib/alert-digest.ts";
import { buildSercopDigest } from "../lib/sercop-alerts.ts";

const t = (o) => normalizeTender({ id: "x" + Math.random(), ref: "SIE-1", status: "interested", ...o });
const APP = "https://volia-control.nexodipa.workers.dev";

test("normaliza lo que llega de afuera y descarta lo inservible", () => {
  assert.equal(normalizeTender(null), null);
  assert.equal(normalizeTender({ ref: "A" }), null, "sin id no sirve");
  const n = normalizeTender({ id: "1", ref: "  SIE  X ", status: "raro", amount: "1500.456", deadline: "mañana", ourPrice: -3 });
  assert.equal(n.ref, "SIE X"); assert.equal(n.status, "interested"); assert.equal(n.amount, 1500.46); assert.equal(n.deadline, ""); assert.equal(n.ourPrice, 0);
});

test("el enlace del correo trae los datos y se lee de vuelta", () => {
  const link = followLink(APP, { ref: "SIE-HG-AM-2026-036-2764", title: "Pinzas laparoscópicas & más", buyer: "HOSPITAL GENERAL AMBATO", amount: "263753.31", province: "TUNGURAHUA" });
  const back = tenderFromParams(new URL(link).search);
  assert.equal(back.ref, "SIE-HG-AM-2026-036-2764"); assert.equal(back.title, "Pinzas laparoscópicas & más");
  assert.equal(back.buyer, "HOSPITAL GENERAL AMBATO"); assert.equal(back.amount, 263753.31); assert.equal(back.province, "TUNGURAHUA");
  assert.equal(tenderFromParams(""), null); assert.equal(tenderFromParams("?x=1"), null);
  assert.ok(tenderFromParams("?seguir=" + "A".repeat(500)).ref.length <= 80, "recorta lo desmedido");
});

test("recordatorios: entre semana a 3, 1 y 0 días; el lunes toda la semana; solo lo no ofertado", () => {
  const list = [t({ id: "a", deadline: "2026-10-30" }), t({ id: "b", deadline: "2026-10-28", status: "preparing" }), t({ id: "c", deadline: "2026-10-29" }), t({ id: "d", deadline: "2026-10-28", status: "offered" }), t({ id: "e", deadline: "2026-10-27" }), t({ id: "f", deadline: "" })];
  assert.deepEqual(deadlineReminders(list, "2026-10-27", false).map((r) => r.id), ["e", "b", "a"], "martes: 0, 1 y 3 días; el de 2 días espera");
  assert.deepEqual(deadlineReminders(list, "2026-10-26", true).map((r) => r.id), ["e", "b", "c", "a"], "lunes: todo lo de la semana");
  assert.deepEqual(deadlineReminders(list, "2026-10-28", false).map((r) => r.id), ["e", "b", "c"], "miércoles: venció ayer, vence hoy y vence mañana");
});

test("estadísticas: tasa de éxito, dinero en juego y oferta típica", () => {
  const s = tenderStats([
    t({ id: "1", status: "won", amount: 1000, ourPrice: 900 }), t({ id: "2", status: "lost", amount: 2000, ourPrice: 1800 }),
    t({ id: "3", status: "lost", amount: 1000, ourPrice: 800 }), t({ id: "4", status: "preparing", amount: 5000 }), t({ id: "5", status: "dropped", amount: 7000 }),
  ]);
  assert.equal(s.open, 1); assert.equal(s.inPlay, 5000); assert.equal(s.decided, 3);
  assert.ok(Math.abs(s.winRate - 1 / 3) < 1e-9); assert.equal(s.wonAmount, 900);
  assert.ok(Math.abs(s.typicalOfferRatio - 0.9) < 1e-9, "mediana de 0.9, 0.9 y 0.8");
  const empty = tenderStats([]); assert.equal(empty.winRate, null); assert.equal(empty.typicalOfferRatio, null);
});

test("orden: abiertos con fecha primero (más cercana arriba), luego sin fecha, luego cerrados", () => {
  const out = sortTenders([t({ id: "closed", status: "won", createdAt: "2026-01-01" }), t({ id: "nodate", createdAt: "2026-02-01" }), t({ id: "late", deadline: "2026-12-01" }), t({ id: "soon", deadline: "2026-11-01" })]);
  assert.deepEqual(out.map((x) => x.id), ["soon", "late", "nodate", "closed"]);
});

test("el resumen diario incluye los procesos por vencer y cuenta como novedad", () => {
  const list = [t({ id: "a", ref: "SIE-A", buyer: "Hospital X", deadline: "2026-10-30" })];
  const d = buildDigest([], [], "2026-10-27", APP, list); // martes, faltan 3 días
  assert.equal(d.counts.procesos, 1); assert.match(d.text, /SIE-A/); assert.match(d.text, /3 día/); assert.match(d.subject, /1 proceso\(s\) por ofertar/);
  assert.equal(buildDigest([], [], "2026-10-27", APP, [t({ deadline: "2026-11-20" })]), null, "lejano: no avisa");
  assert.equal(buildDigest([], [], "2026-10-27", APP), null, "sin procesos sigue igual que antes");
});

test("el correo del SERCOP trae el enlace para dar seguimiento", () => {
  const row = { id: 1, ocid: "ocds-1", year: 2026, month: 10, internal_type: "SIE", region: "PICHINCHA", locality: "QUITO", buyer: "HOSPITAL X", amount: "1000", date: null, title: "SIE-HX-2026-001", description: "Material de osteosíntesis", budget: "1200" };
  const mail = buildSercopDigest([row], "2026-10-27", false, false);
  assert.match(mail.text, /Dar seguimiento: https:\/\/volia-control\.nexodipa\.workers\.dev\/\?seguir=SIE-HX-2026-001/);
  assert.match(mail.html, /href="https:\/\/volia-control\.nexodipa\.workers\.dev\/\?seguir=SIE-HX-2026-001[^"]*"/);
  assert.doesNotMatch(mail.html, /href="[^"]*&(?!amp;)/, "los & del enlace van escapados en el HTML");
});
