// Auditoría de calidad del catálogo de sistemas (LISTA SISTEMA VOLIA).
// Uso: node scripts/audit-catalog.mjs   (sale con código 1 si hay hallazgos)
import { VOLIA_SYSTEMS, VOLIA_SYSTEM_PRODUCTS } from "../lib/volia-system-catalog.ts";

const findings = [];
const add = (tipo, detalle) => findings.push({ tipo, detalle });

// 1. Descripciones inválidas importadas desde Excel.
for (const p of VOLIA_SYSTEM_PRODUCTS) {
  if (/^#(NAME|REF|VALUE|N\/A)/i.test(p.description) || !p.description.trim()) {
    add("descripcion-invalida", `${p.code}: "${p.description}"`);
  }
}

// 2. Mismo código con descripciones o precios distintos.
const byCode = new Map();
const push = (code, description, price, where) => {
  const list = byCode.get(code) ?? [];
  list.push({ description, price, where });
  byCode.set(code, list);
};
for (const s of VOLIA_SYSTEMS) {
  for (const i of s.items) push(i.code, i.description, i.unitPrice, `sistema:${s.name}`);
}
for (const p of VOLIA_SYSTEM_PRODUCTS) push(p.code, p.description, p.unitPrice, `producto:${p.sourceSheet}`);
for (const [code, list] of byCode) {
  const prices = new Set(list.map((x) => x.price));
  const descs = new Set(list.map((x) => x.description.trim().toUpperCase()));
  if (prices.size > 1) add("precio-inconsistente", `${code}: ${[...prices].join(" / ")} en ${list.map((x) => x.where).join(", ")}`);
  if (descs.size > 1) add("descripcion-inconsistente", `${code}: ${[...descs].join(" | ")}`);
}

// 3. Código repetido dentro de un mismo sistema, o con nombres contradictorios.
for (const s of VOLIA_SYSTEMS) {
  const seen = new Map();
  for (const i of s.items) seen.set(i.code, (seen.get(i.code) ?? 0) + 1);
  for (const [code, n] of seen) if (n > 1) add("codigo-repetido-en-sistema", `${s.name}: ${code} x${n}`);
  const name = s.name.toUpperCase();
  for (const i of s.items) {
    const d = i.description.toUpperCase();
    if (name.includes("TIBIAL") && d.includes("FEMORAL")) add("contradice-nombre-del-sistema", `${s.name}: ${i.code} "${i.description}"`);
    if (name.includes("FEMORAL") && d.includes("TIBIAL")) add("contradice-nombre-del-sistema", `${s.name}: ${i.code} "${i.description}"`);
  }
}

// 4. Tornillos del mismo sistema con medida distinta a la de la placa (ej. placa 1,5 con tornillo 2,0).
for (const s of VOLIA_SYSTEMS) {
  const m = s.name.match(/(\d),(\d)/);
  if (!m) continue;
  const size = `${m[1]},${m[2]}`;
  for (const i of s.items) {
    const t = i.description.match(/TORNILLO[^\d]*(\d),(\d)/i);
    if (t && `${t[1]},${t[2]}` !== size) add("medida-tornillo-distinta", `${s.name}: ${i.code} "${i.description}"`);
  }
}

// 5. Precios no positivos.
for (const p of VOLIA_SYSTEM_PRODUCTS) if (!(p.unitPrice > 0)) add("precio-no-positivo", `${p.code}: ${p.unitPrice}`);

const grupos = findings.reduce((a, f) => ((a[f.tipo] = (a[f.tipo] ?? 0) + 1), a), {});
console.log(`Sistemas: ${VOLIA_SYSTEMS.length}  Productos: ${VOLIA_SYSTEM_PRODUCTS.length}  Hallazgos: ${findings.length}`);
console.log(grupos);
for (const f of findings) console.log(`[${f.tipo}] ${f.detalle}`);
process.exit(findings.length ? 1 : 0);
