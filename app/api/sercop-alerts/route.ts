import { runSercopCheck } from "../../../lib/sercop-alerts";
import { apiJson, requireBusinessAccess } from "../../../lib/server-auth";

export const dynamic = "force-dynamic";

const config = () => (globalThis as typeof globalThis & { __VOLIA_ALERTS__?: { url?: string; secret?: string } }).__VOLIA_ALERTS__;

// Revisa el SERCOP ahora. Con ?dry=1 solo cuenta y no envía ni marca nada.
export async function POST(request: Request) {
  const access = await requireBusinessAccess();
  if (access instanceof Response) return access;
  const dryRun = new URL(request.url).searchParams.get("dry") === "1";
  const result = await runSercopCheck(access.db as never, config(), { dryRun });
  return apiJson(result, result.ok ? 200 : 502);
}
