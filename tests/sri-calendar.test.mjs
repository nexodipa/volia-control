import assert from "node:assert/strict";
import test from "node:test";
import { VOLIA_RUC, isBusinessDay, ninthDigit, nextSriDue, sriDigest, sriDueDate } from "../lib/sri-calendar.ts";
import { buildDigest } from "../lib/alert-digest.ts";

test("el RUC de Volia tiene noveno dígito 0 y vence el día 28", () => {
  assert.equal(ninthDigit(VOLIA_RUC), "0");
  assert.equal(sriDueDate(VOLIA_RUC, 2026, 12), "2026-12-28"); // lunes
  assert.equal(sriDueDate(VOLIA_RUC, 2026, 10), "2026-10-28"); // miércoles
});

test("tabla por noveno dígito", () => {
  const day = (digit) => sriDueDate(`12345678${digit}0001`, 2026, 10);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9].map(day), ["2026-10-12", "2026-10-12", "2026-10-14", "2026-10-16", "2026-10-19", "2026-10-20", "2026-10-22", "2026-10-26", "2026-10-26"]);
});

test("fin de semana pasa al siguiente día hábil y, si cambia de mes, se adelanta", () => {
  assert.equal(sriDueDate(VOLIA_RUC, 2026, 11), "2026-11-30"); // sábado 28
  assert.equal(sriDueDate(VOLIA_RUC, 2027, 2), "2027-02-26"); // domingo 28: lunes sería marzo
  assert.equal(sriDueDate("1793206810001", 2026, 10), "2026-10-12"); // dígito 1: el 10 es sábado; el 12 es lunes
  assert.equal(isBusinessDay("2026-12-25"), false);
  assert.equal(isBusinessDay("2026-12-24"), true);
  assert.equal(sriDueDate(VOLIA_RUC, 2026, 11, ["2026-11-30"]), "2026-11-27"); // feriado extra: cambia de mes, se adelanta
});

test("próxima declaración: este mes o el siguiente", () => {
  const a = nextSriDue(VOLIA_RUC, "2026-10-23");
  assert.deepEqual(a, { due: "2026-10-28", days: 5, period: "septiembre de 2026" });
  const b = nextSriDue(VOLIA_RUC, "2026-10-29");
  assert.equal(b.due, "2026-11-30");
  assert.equal(b.period, "octubre de 2026");
  const c = nextSriDue(VOLIA_RUC, "2026-12-29");
  assert.equal(c.due, "2027-01-28");
  assert.equal(c.period, "diciembre de 2026");
});

test("avisos: lunes desde 10 días; otros días a 7, 3, 1 y 0", () => {
  assert.equal(sriDigest(VOLIA_RUC, "2026-10-19", true).total, 1); // 9 días
  assert.equal(sriDigest(VOLIA_RUC, "2026-10-12", true).total, 0); // 16 días
  assert.equal(sriDigest(VOLIA_RUC, "2026-10-21", false).total, 1); // 7 días
  assert.equal(sriDigest(VOLIA_RUC, "2026-10-22", false).total, 0); // 6 días
  assert.equal(sriDigest(VOLIA_RUC, "2026-10-27", false).total, 1); // 1 día
  assert.match(sriDigest(VOLIA_RUC, "2026-10-28", false).lines[0], /vence hoy/);
  assert.match(sriDigest(VOLIA_RUC, "2026-10-21", false).lines[0], /vence en 7 días \(2026-10-28\)/);
});

test("el resumen diario envía el aviso del SRI solo con el RUC y puede salir solo", () => {
  assert.equal(buildDigest([], [], "2026-10-27", "https://x.example"), null);
  const d = buildDigest([], [], "2026-10-27", "https://x.example", [], [], { items: [], moves: [] }, [], VOLIA_RUC);
  assert.ok(d);
  assert.equal(d.counts.sri, 1);
  assert.match(d.text, /SRI: declaración mensual/);
  assert.match(d.subject, /declaración del SRI/);
  assert.equal(buildDigest([], [], "2026-10-15", "https://x.example", [], [], { items: [], moves: [] }, [], VOLIA_RUC), null);
});
