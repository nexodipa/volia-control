import assert from "node:assert/strict";
import test from "node:test";
import { extractGeminiText, geminiEndpoint, validateAiRequest } from "../lib/ai-proxy.ts";

test("validates model, prompt and temperature; key never goes in the URL", () => {
  const ok = validateAiRequest({ model: "gemini-1.5-pro", prompt: " hola ", temperature: 3 });
  assert.equal(ok.ok, true);
  assert.equal(ok.request.temperature, 1);
  assert.equal(ok.request.prompt, "hola");
  assert.equal(validateAiRequest({ model: "otro", prompt: "x" }).request.model, "gemini-2.0-flash");
  assert.equal(validateAiRequest({ prompt: "" }).ok, false);
  assert.equal(validateAiRequest({ prompt: "x".repeat(50_000) }).ok, false);
  assert.ok(!geminiEndpoint("gemini-2.0-flash").includes("key="));
});

test("extracts text from a Gemini response", () => {
  assert.equal(extractGeminiText({ candidates: [{ content: { parts: [{ text: "Respuesta" }] } }] }), "Respuesta");
  assert.equal(extractGeminiText({}), null);
});
