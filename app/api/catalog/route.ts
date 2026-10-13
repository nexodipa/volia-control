import { apiJson, requireBusinessAccess } from "../../../lib/server-auth";
import { fromProductRow, toProductRow, validateProducts, type ProductRow } from "../../../lib/catalog-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireBusinessAccess();
  if (access instanceof Response) return access;
  const { results } = await access.db
    .prepare("SELECT code, name, category, brand, origin, reference_cost_cents, sale_price_cents, active, updated_at FROM products ORDER BY code")
    .all<ProductRow>();
  return apiJson({ products: results.map(fromProductRow) });
}

// Inserta o actualiza por código solo los productos enviados.
export async function PUT(request: Request) {
  const access = await requireBusinessAccess();
  if (access instanceof Response) return access;
  const raw = await request.text();
  if (raw.length > 1_000_000) return apiJson({ error: "El envío es demasiado grande." }, 413);
  let body: { products?: unknown };
  try { body = JSON.parse(raw); } catch { return apiJson({ error: "JSON inválido." }, 400); }
  const checked = validateProducts(body.products);
  if (!checked.ok) return apiJson({ error: checked.error }, 400);
  if (!checked.products.length) return apiJson({ saved: 0 });
  const now = new Date().toISOString();
  const upsert = access.db.prepare(
    `INSERT INTO products (code, name, category, brand, origin, reference_cost_cents, sale_price_cents, active, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
     ON CONFLICT(code) DO UPDATE SET name = ?2, category = ?3, brand = ?4, origin = ?5, reference_cost_cents = ?6, sale_price_cents = ?7, active = ?8, updated_at = ?10`,
  );
  const audit = access.db.prepare("INSERT INTO audit_events (action, entity, entity_id, detail, at) VALUES ('upsert', 'products', ?1, ?2, ?3)");
  await access.db.batch(checked.products.flatMap((p) => {
    const r = toProductRow(p);
    return [
      upsert.bind(r.code, r.name, r.category, r.brand, r.origin, r.reference_cost_cents, r.sale_price_cents, r.active, now, r.updated_at),
      audit.bind(r.code, `${access.email}: costo ${r.reference_cost_cents / 100} / venta ${r.sale_price_cents / 100}`, now),
    ];
  }));
  return apiJson({ saved: checked.products.length, at: now });
}

export async function DELETE(request: Request) {
  const access = await requireBusinessAccess();
  if (access instanceof Response) return access;
  const code = (new URL(request.url).searchParams.get("code") ?? "").trim().toUpperCase();
  if (!code || code.length > 60) return apiJson({ error: "Código inválido." }, 400);
  const now = new Date().toISOString();
  await access.db.batch([
    access.db.prepare("DELETE FROM products WHERE code = ?1").bind(code),
    access.db.prepare("INSERT INTO audit_events (action, entity, entity_id, detail, at) VALUES ('delete', 'products', ?1, ?2, ?3)").bind(code, access.email, now),
  ]);
  return apiJson({ deleted: code });
}
