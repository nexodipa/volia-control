import { apiJson, requireBusinessAccess } from "../../../lib/server-auth";
import { fromRow, toRow, validateRecords, type RegulatoryRow } from "../../../lib/regulatory-api";

export const dynamic = "force-dynamic";

const MAX_BODY_CHARS = 1_000_000;

export async function GET() {
  const access = await requireBusinessAccess();
  if (access instanceof Response) return access;
  const { results } = await access.db
    .prepare("SELECT code, kind, reference, subject, covered_items, expires_at, note, updated_at FROM regulatory_documents ORDER BY expires_at IS NULL, expires_at")
    .all<RegulatoryRow>();
  return apiJson({ records: results.map(fromRow) });
}

// Inserta o actualiza por código solo los documentos enviados (los que cambiaron en el equipo).
export async function PUT(request: Request) {
  const access = await requireBusinessAccess();
  if (access instanceof Response) return access;
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) return apiJson({ error: "El envío es demasiado grande." }, 413);
  let body: { records?: unknown };
  try { body = JSON.parse(raw); } catch { return apiJson({ error: "JSON inválido." }, 400); }
  const checked = validateRecords(body.records);
  if (!checked.ok) return apiJson({ error: checked.error }, 400);
  if (!checked.records.length) return apiJson({ saved: 0 });

  const now = new Date().toISOString();
  const upsert = access.db.prepare(
    `INSERT INTO regulatory_documents (code, kind, reference, subject, covered_items, expires_at, note, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
     ON CONFLICT(code) DO UPDATE SET kind = ?2, reference = ?3, subject = ?4, covered_items = ?5, expires_at = ?6, note = ?7, updated_at = ?8`,
  );
  const audit = access.db.prepare("INSERT INTO audit_events (action, entity, entity_id, detail, at) VALUES ('upsert', 'regulatory_documents', ?1, ?2, ?3)");
  const statements = checked.records.flatMap((r) => {
    const row = toRow(r);
    return [
      upsert.bind(row.code, row.kind, row.reference, row.subject, row.covered_items, row.expires_at, row.note, row.updated_at ?? now),
      audit.bind(row.code, `${access.email}: vence ${row.expires_at ?? "sin fecha"}`, now),
    ];
  });
  await access.db.batch(statements);
  return apiJson({ saved: checked.records.length, at: now });
}

export async function DELETE(request: Request) {
  const access = await requireBusinessAccess();
  if (access instanceof Response) return access;
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!/^[a-z0-9._-]{1,120}$/i.test(code)) return apiJson({ error: "Código inválido." }, 400);
  const now = new Date().toISOString();
  await access.db.batch([
    access.db.prepare("DELETE FROM regulatory_documents WHERE code = ?1").bind(code),
    access.db.prepare("INSERT INTO audit_events (action, entity, entity_id, detail, at) VALUES ('delete', 'regulatory_documents', ?1, ?2, ?3)").bind(code, access.email, now),
  ]);
  return apiJson({ deleted: code });
}
