// Consulta a Google Gemini desde el servidor: la clave vive como secreto del worker (GEMINI_API_KEY),
// nunca en el navegador ni en la URL.
export const AI_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"] as const;
export type AiModel = (typeof AI_MODELS)[number];
export type AiRequest = { model: AiModel; prompt: string; temperature: number };

const MAX_PROMPT_CHARS = 40_000;

export function validateAiRequest(input: unknown): { ok: true; request: AiRequest } | { ok: false; error: string } {
  const raw = (input ?? {}) as Record<string, unknown>;
  const model = (AI_MODELS as readonly string[]).includes(String(raw.model)) ? (raw.model as AiModel) : "gemini-2.0-flash";
  const prompt = typeof raw.prompt === "string" ? raw.prompt.trim() : "";
  if (!prompt) return { ok: false, error: "Falta la consulta." };
  if (prompt.length > MAX_PROMPT_CHARS) return { ok: false, error: "La consulta es demasiado larga." };
  const t = Number(raw.temperature);
  const temperature = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.2;
  return { ok: true, request: { model, prompt, temperature } };
}

export function geminiEndpoint(model: AiModel) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export function extractGeminiText(json: unknown): string | null {
  const text = (json as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === "string" && text.trim() ? text : null;
}
