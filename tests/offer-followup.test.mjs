import assert from "node:assert/strict";
import test from "node:test";
import { followStage, offerDate, offerFollowUps, statusDraft } from "../lib/offer-followup.ts";
import { normalizeTender } from "../lib/tenders.ts";
import { buildDigest } from "../lib/alert-digest.ts";

const URL = "https://x.example";
const tender = (o = {}) => normalizeTender({ id: "t1", ref: "SIE-HG-AM-2026-036-2764", title: "Guantes de examen", buyer: "Hospital General Ibarra", status: "offered", offeredAt: "2026-10-19", createdAt: "2026-10-01T10:00:00Z", ...o });
const contact = (o = {}) => ({ id: "c1", institution: "HOSPITAL GENERAL IBARRA", name: "Ing. Marco Reyes", role: "Compras", phone: "", email: "compras@hgi.gob.ec", from: "", to: "", notes: "", ...o });

test("stage by days since the offer", () => {
  assert.equal(followStage(6), null);
  assert.equal(followStage(7), "portal");
  assert.equal(followStage(14), "portal");
  assert.equal(followStage(15), "estado");
  assert.equal(followStage(30), "entidad");
  assert.equal(followStage(45), "cerrar");
  assert.equal(followStage(300), "cerrar");
});

test("offeredAt survives normalisation and bad values are dropped", () => {
  assert.equal(tender().offeredAt, "2026-10-19");
  assert.equal(tender({ offeredAt: "ayer" }).offeredAt, "");
});

test("without an offer date it falls back to the day tracking started", () => {
  assert.equal(offerDate(tender({ offeredAt: "" })), "2026-10-01");
  assert.equal(offerDate({ offeredAt: "", createdAt: "" }), "");
});

test("only offered tenders are followed; Monday lists all, weekdays only the marks", () => {
  const ts = [tender(), tender({ id: "t2", ref: "B", status: "won" }), tender({ id: "t3", ref: "C", status: "preparing" })];
  const mon = offerFollowUps(ts, "2026-11-23", true); // 35 días
  assert.deepEqual(mon.map((o) => [o.tender.ref, o.days, o.stage]), [["SIE-HG-AM-2026-036-2764", 35, "entidad"]]);
  assert.equal(offerFollowUps(ts, "2026-11-24", false).length, 0); // 36
  assert.equal(offerFollowUps(ts, "2026-11-18", false).length, 1); // 30 exactos
  assert.equal(offerFollowUps([tender({ offeredAt: "2026-11-15" })], "2026-11-18", true).length, 0); // 3 días: aún no
});

test("marks repeat every 30 days after 90", () => {
  const at = (days) => offerFollowUps([tender({ offeredAt: "2026-01-01" })], new Date(Date.parse("2026-01-01T12:00:00Z") + days * 86400000).toISOString().slice(0, 10), false).length;
  assert.equal(at(90), 1);
  assert.equal(at(100), 0);
  assert.equal(at(120), 1);
  assert.equal(at(150), 1);
});

test("status draft asks only for the state and defers to the portal", () => {
  const d = statusDraft(tender(), "2026-11-18", [contact()]);
  assert.equal(d.to, "compras@hgi.gob.ec");
  assert.equal(d.subject, "Consulta de estado del proceso SIE-HG-AM-2026-036-2764");
  assert.match(d.body, /^Estimado\(a\) Ing\. Marco Reyes:/);
  assert.match(d.body, /presentó oferta en el proceso SIE-HG-AM-2026-036-2764 \(Guantes de examen\) el 19 de octubre del 2026/);
  assert.match(d.body, /comunicaciones oficiales del proceso se realizan por el portal/);
  assert.match(d.body, /Volia S\.A\.S\.$/);
  assert.equal(statusDraft(tender({ buyer: "" }), "2026-11-18").body.split("\n")[0], "Estimados señores de [entidad contratante]:");
  assert.equal(statusDraft(tender({ offeredAt: "", createdAt: "" }), "2026-11-18"), null);
});

test("digest has an offers section with the action to take", () => {
  const d = buildDigest([], [], "2026-11-23", URL, [tender()]);
  assert.ok(d);
  assert.equal(d.counts.ofertas, 1);
  assert.match(d.text, /Ofertas presentadas por seguir \(1\)/);
  assert.match(d.text, /presentada hace 35 día\(s\) · consultar a la entidad por el resultado/);
  assert.equal(buildDigest([], [], "2026-11-24", URL, [tender()]), null);
});
