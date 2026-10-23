import { alertsConfigured, sendDigest } from "../../../lib/alert-sender";
import { apiJson, requireBusinessAccess } from "../../../lib/server-auth";

export const dynamic = "force-dynamic";

const config = () => (globalThis as typeof globalThis & { __VOLIA_ALERTS__?: { url?: string; secret?: string } }).__VOLIA_ALERTS__;

export async function GET() {
  const access = await requireBusinessAccess();
  if (access instanceof Response) return access;
  return apiJson({ configured: alertsConfigured(config()) });
}

// Envía ahora un resumen de prueba (siempre manda algo, aunque no haya novedades).
export async function POST() {
  const access = await requireBusinessAccess();
  if (access instanceof Response) return access;
  const result = await sendDigest(access.db as never, config(), { test: true });
  return apiJson(result, result.ok ? 200 : 502);
}
