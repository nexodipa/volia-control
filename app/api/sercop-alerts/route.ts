import { readLastSercop, runAndRecordSercop } from "../../../lib/sercop-alerts";
import { apiJson, requireBusinessAccess } from "../../../lib/server-auth";

export const dynamic = "force-dynamic";

const config = () => (globalThis as typeof globalThis & { __VOLIA_ALERTS__?: { url?: string; secret?: string } }).__VOLIA_ALERTS__;

// Último resultado de la revisión del SERCOP (para mostrarlo en Inicio).
export async function GET() {
  const access = await requireBusinessAccess();
  if (access instanceof Response) return access;
  return apiJson({ last: await readLastSercop(access.db as never) });
}

// Revisa el SERCOP ahora. La consulta tarda 1-2 minutos (el SERCOP responde lento). En Workers, lo que queda en
// waitUntil se corta ~30 s después de responder, así que la respuesta se mantiene abierta (con espacios de latido,
// válidos antes de un JSON) hasta que termina la revisión.
export async function POST() {
  const access = await requireBusinessAccess();
  if (access instanceof Response) return access;
  const enc = new TextEncoder();
  const db = access.db as never;
  const cfg = config();
  let beat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      beat = setInterval(() => { try { controller.enqueue(enc.encode(" ")); } catch { /* cliente cerrado */ } }, 5000);
      const r = await runAndRecordSercop(db, cfg);
      clearInterval(beat);
      try { controller.enqueue(enc.encode(JSON.stringify(r))); controller.close(); } catch { /* cliente cerrado */ }
    },
    cancel() { if (beat) clearInterval(beat); },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}
