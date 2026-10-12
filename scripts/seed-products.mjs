// Genera db/seed-products.sql desde el catálogo existente (solo código, nombre, categoría).
// NO carga precios: aún no se sabe si el catálogo trae costo o venta. Códigos con datos
// contradictorios se siembran con la primera descripción y se listan como comentario.
// Uso: node scripts/seed-products.mjs > db/seed-products.sql
import { VOLIA_SYSTEMS, VOLIA_SYSTEM_PRODUCTS } from "../lib/volia-system-catalog.ts";

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const byCode = new Map();
const add = (code, name, category) => {
  const c = String(code).trim();
  if (!c || /^#(NAME|REF|VALUE|N\/A)/i.test(name) || !name.trim()) return;
  const e = byCode.get(c) ?? { names: new Set(), category };
  e.names.add(name.trim());
  byCode.set(c, e);
};
for (const p of VOLIA_SYSTEM_PRODUCTS) add(p.code, p.description, p.sourceSheet || "General");
for (const s of VOLIA_SYSTEMS) for (const i of s.items) add(i.code, i.description, "General");

const now = new Date().toISOString();
const out = ["-- Siembra de productos (por verificar). Generado por scripts/seed-products.mjs", "BEGIN TRANSACTION;"];
for (const [code, e] of [...byCode].sort(([a], [b]) => a.localeCompare(b))) {
  const names = [...e.names];
  if (names.length > 1) out.push(`-- CONFLICTO ${code}: ${names.join(" | ").replace(/\n/g, " ")}`);
  out.push(
    `INSERT OR IGNORE INTO products (code, name, category, unit, active, created_at, updated_at) VALUES (${q(code)}, ${q(names[0])}, ${q(e.category)}, 'UNIDAD', 1, ${q(now)}, ${q(now)});`,
  );
}
out.push("COMMIT;");
console.log(out.join("\n"));
