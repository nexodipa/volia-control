import { isMailStatus, listMail, listMailMeta, mailSummary, parseMailSources, pruneMail, setMailStatus, syncAll } from "../../../lib/mail-sync";
import { ecuadorToday } from "../../../lib/alert-digest";
import { apiJson, requireBusinessAccess, requireEditorAccess } from "../../../lib/server-auth";

export const dynamic = "force-dynamic";

const sources = () => parseMailSources((globalThis as typeof globalThis & { __VOLIA_MAIL__?: string }).__VOLIA_MAIL__);

// Correos ya clasificados, el estado de cada buzón y si hay buzones configurados.
export async function GET() {
  const access = await requireBusinessAccess();
  if (access instanceof Response) return access;
  const db = access.db as never;
  const records = await listMail(db);
  return apiJson({ records, meta: await listMailMeta(db), mailboxes: sources().map((s) => s.name), summary: mailSummary(records, ecuadorToday()) });
}

// Revisa los buzones ahora (solo lo que cada persona etiquetó con «Volia»).
export async function POST() {
  const access = await requireEditorAccess();
  if (access instanceof Response) return access;
  const list = sources();
  if (!list.length) return apiJson({ ok: false, message: "No hay buzones conectados todavía. Siga docs/correo.md para conectar el primero.", results: [] });
  const db = access.db as never;
  const results = await syncAll(db, list);
  await pruneMail(db).catch(() => undefined);
  return apiJson({ ok: results.every((r) => r.ok), message: results.map((r) => `${r.source}: ${r.message}`).join(" "), results });
}

// Cambia el estado de un correo: nuevo, revisado o descartado.
export async function PATCH(request: Request) {
  const access = await requireEditorAccess();
  if (access instanceof Response) return access;
  let body: { id?: unknown; status?: unknown };
  try { body = await request.json(); } catch { return apiJson({ error: "JSON inválido." }, 400); }
  if (typeof body.id !== "string" || !body.id || body.id.length > 120 || !isMailStatus(body.status)) return apiJson({ error: "Datos inválidos." }, 400);
  await setMailStatus(access.db as never, body.id, body.status, access.email);
  return apiJson({ ok: true });
}
