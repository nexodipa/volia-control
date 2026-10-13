import { apiJson, requireBusinessAccess } from "../../../lib/server-auth";
import { extractGeminiText, geminiEndpoint, validateAiRequest } from "../../../lib/ai-proxy";

export const dynamic = "force-dynamic";

const geminiKey = () => ((globalThis as typeof globalThis & { __VOLIA_GEMINI_KEY__?: string }).__VOLIA_GEMINI_KEY__ ?? "").trim();

export async function GET() {
  const access = await requireBusinessAccess();
  if (access instanceof Response) return access;
  return apiJson({ configured: !!geminiKey() });
}

export async function POST(request: Request) {
  const access = await requireBusinessAccess();
  if (access instanceof Response) return access;
  const key = geminiKey();
  if (!key) return apiJson({ error: "La IA no está configurada en el servidor." }, 503);
  let body: unknown;
  try { body = await request.json(); } catch { return apiJson({ error: "JSON inválido." }, 400); }
  const checked = validateAiRequest(body);
  if (!checked.ok) return apiJson({ error: checked.error }, 400);
  const { model, prompt, temperature } = checked.request;
  const res = await fetch(geminiEndpoint(model), {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature } }),
  });
  if (!res.ok) return apiJson({ error: `El servicio de IA respondió ${res.status}.` }, 502);
  const text = extractGeminiText(await res.json());
  if (!text) return apiJson({ error: "El servicio de IA no devolvió texto." }, 502);
  return apiJson({ text, model });
}
