// Validación y conversión entre CatalogProduct (pantalla) y la tabla products. Dinero en centavos en la base.
import type { CatalogProduct } from "./product-catalog";

export type ProductRow = { code: string; name: string; category: string; brand: string | null; origin: string | null; reference_cost_cents: number; sale_price_cents: number; active: number; updated_at: string };

const MAX = 500;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const money = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 10_000_000 ? v : NaN);

export function validateProducts(input: unknown): { ok: true; products: CatalogProduct[] } | { ok: false; error: string } {
  if (!Array.isArray(input)) return { ok: false, error: "Se esperaba una lista de productos." };
  if (input.length > MAX) return { ok: false, error: `Máximo ${MAX} productos por envío.` };
  const seen = new Set<string>();
  const products: CatalogProduct[] = [];
  for (const raw of input as Record<string, unknown>[]) {
    const code = text(raw?.code, 60).toUpperCase();
    const description = text(raw?.description, 400);
    const unitCost = money(raw?.unitCost);
    const salePrice = money(raw?.salePrice);
    if (!code || !/^[A-Z0-9][A-Z0-9._\-/ ]*$/.test(code)) return { ok: false, error: `Código inválido: ${code || "(vacío)"}` };
    if (seen.has(code)) return { ok: false, error: `Código repetido: ${code}` };
    if (!description) return { ok: false, error: `Falta la descripción en ${code}` };
    if (Number.isNaN(unitCost) || Number.isNaN(salePrice)) return { ok: false, error: `Costo o precio inválido en ${code}` };
    const updatedAt = text(raw?.updatedAt, 40);
    seen.add(code);
    products.push({
      id: text(raw?.id, 80) || `catalog-${code}`,
      code, description,
      brand: text(raw?.brand, 120), origin: text(raw?.origin, 120), category: text(raw?.category, 120) || "General",
      unitCost, salePrice, active: raw?.active !== false,
      updatedAt: updatedAt && !Number.isNaN(Date.parse(updatedAt)) ? new Date(Math.min(Date.parse(updatedAt), Date.now() + 5 * 60_000)).toISOString() : new Date().toISOString(),
    });
  }
  return { ok: true, products };
}

const cents = (usd: number) => Math.round(usd * 100);

export function toProductRow(p: CatalogProduct): ProductRow {
  return { code: p.code, name: p.description, category: p.category, brand: p.brand || null, origin: p.origin || null, reference_cost_cents: cents(p.unitCost), sale_price_cents: cents(p.salePrice), active: p.active ? 1 : 0, updated_at: p.updatedAt };
}

export function fromProductRow(row: ProductRow): CatalogProduct {
  return { id: `catalog-${row.code}`, code: row.code, description: row.name, brand: row.brand ?? "", origin: row.origin ?? "", category: row.category, unitCost: row.reference_cost_cents / 100, salePrice: row.sale_price_cents / 100, active: !!row.active, updatedAt: row.updated_at };
}
