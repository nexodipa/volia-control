// Reproduce los totales del "Informe de necesidad INSUMOS MEDICOS" (33 ítems), en centavos.
// Fuente: [no, cantidad, costo total, PVP total] tal como figuran en la hoja.
import assert from "node:assert/strict";
import test from "node:test";

import { marginBps } from "../lib/business-alerts.ts";

const rows = [
  [1, 5, 4990, 9980], [2, 2, 7000, 11667], [3, 628, 1256, 2512], [4, 6, 3000, 6000], [5, 74, 22200, 37000],
  [6, 180, 22500, 45000], [7, 7, 3850, 7700], [8, 83, 11205, 22410], [9, 463, 34725, 69450], [10, 222, 27306, 54612],
  [11, 894, 7152, 17880], [12, 47, 5781, 11562], [13, 2, 3600, 7200], [14, 90, 45000, 90000], [15, 302, 135900, 226500],
  [16, 65, 1885, 3770], [17, 149, 5215, 10430], [18, 75, 2550, 5100], [19, 10, 2100, 4200], [20, 68, 14280, 28560],
  [21, 194, 2231, 3718], [22, 629, 5598, 9330], [23, 567, 5046, 12616], [24, 300, 3750, 7500], [25, 99, 2020, 4039],
  [26, 36, 43200, 72000], [27, 61, 14640, 29280], [28, 1160, 52200, 104400], [29, 4977, 447930, 895860], [30, 5, 1250, 2500],
  [31, 1292, 2584, 5168], [32, 1044, 78300, 156600], [33, 65, 1690, 3380],
];

test("33 items", () => assert.equal(rows.length, 33));

test("totals match the sheet (costo 10,219.34 / PVP 19,779.24)", () => {
  const cost = rows.reduce((s, r) => s + r[2], 0);
  const pvp = rows.reduce((s, r) => s + r[3], 0);
  assert.equal(cost, 1_021_934);
  assert.equal(pvp, 1_977_924);
});

test("global margin on PVP is ~48%, and the Papanicolaou kit is ~45% of PVP", () => {
  const cost = 1_021_934, pvp = 1_977_924;
  assert.equal(marginBps(cost, pvp), 4833);
  const kitShare = 895_860 / pvp;
  assert.ok(kitShare > 0.45 && kitShare < 0.46);
});
