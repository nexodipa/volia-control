import { apiJson, requireBusinessAccess, requireEditorAccess } from "../../../lib/server-auth";
import { isSharedCollection, validateSharedRecords } from "../../../lib/shared-records";

export const dynamic = "force-dynamic";

type Row = { record_id: string; data: string; updated_at: string; deleted: number };

export async function GET(request: Request) {
  const access = await requireBusinessAccess();
  if (access instanceof Response) return access;
  const collection = new URL(request.url).searchParams.get("collection");
  if (!isSharedCollection(collection)) return apiJson({ error: "Colección inválida." }, 400);
  const { results } = await access.db
    .prepare("SELECT record_id, data, updated_at, deleted FROM shared_records WHERE collection = ?1")
    .bind(collection)
    .all<Row>();
  const records = results.map((r) => {
    let data: unknown = null;
    try { data = JSON.parse(r.data); } catch { data = null; }
    return { id: r.record_id, data, updatedAt: r.updated_at, deleted: !!r.deleted };
  });
  return apiJson({ records });
}

// Inserta o actualiza; una versión más vieja que la guardada se ignora (gana la modificación más reciente).
export async function PUT(request: Request) {
  const access = await requireEditorAccess();
  if (access instanceof Response) return access;
  const raw = await request.text();
  if (raw.length > 2_000_000) return apiJson({ error: "El envío es demasiado grande." }, 413);
  let body: { collection?: unknown; records?: unknown };
  try { body = JSON.parse(raw); } catch { return apiJson({ error: "JSON inválido." }, 400); }
  if (!isSharedCollection(body.collection)) return apiJson({ error: "Colección inválida." }, 400);
  const checked = validateSharedRecords(body.records);
  if (!checked.ok) return apiJson({ error: checked.error }, 400);
  if (!checked.records.length) return apiJson({ saved: 0 });
  const upsert = access.db.prepare(
    `INSERT INTO shared_records (collection, record_id, data, updated_at, deleted, updated_by)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(collection, record_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at,
       deleted = excluded.deleted, updated_by = excluded.updated_by
     WHERE excluded.updated_at >= shared_records.updated_at`,
  );
  const now = new Date().toISOString();
  const audit = access.db.prepare("INSERT INTO audit_events (action, entity, entity_id, detail, at) VALUES (?1, ?2, ?3, ?4, ?5)");
  const collection = body.collection;
  await access.db.batch(checked.records.flatMap((r) => [
    upsert.bind(collection, r.id, JSON.stringify(r.data), r.updatedAt, r.deleted ? 1 : 0, access.email),
    audit.bind(r.deleted ? "delete" : "upsert", `shared:${collection}`, r.id, access.email, now),
  ]));
  return apiJson({ saved: checked.records.length, at: now });
}
