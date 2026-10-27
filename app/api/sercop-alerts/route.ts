import { readLastSercop, runAndRecordSercop } from "../../../lib/sercop-alerts";
import { apiJson, requireBusinessAccess } from "../../../lib/server-auth";

export const dynamic = "force-dynamic";

const config = () => (globalThis as typeof globalThis & { __VOLIA_ALERTS__?: { url?: string; secret?: string } }).__VOLIA_ALERTS__;
const context = () => (globalThis as typeof globalThis & { __VOLIA_CTX__?: { waitUntil(p: Promise<unknown>): void } }).__VOLIA_CTX__;

// Último resultado de la revisión del SERCOP (para mostrarlo en Inicio).
export async function GET() {
  const access = await requireBusinessAccess();
  if (access instanceof Response) return access;
  return apiJson({ last: await readLastSercop(access.db as never) });
}

// Revisa el SERCOP ahora. La consulta tarda ~1 minuto (el SERCOP responde lento), así que corre en segundo plano.
export async function POST() {
  const access = await requireBusinessAccess();
  if (access instanceof Response) return access;
  const job = runAndRecordSercop(access.db as never, config());
  const ctx = context();
  if (!ctx) { const r = await job; return apiJson(r, r.ok ? 200 : 502); }
  ctx.waitUntil(job);
  return apiJson({ ok: true, started: true, message: "Revisión iniciada. Tarda cerca de un minuto." }, 202);
}
