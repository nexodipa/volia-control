// Traductor inglés → español. Aquí vive solo la lógica pura (armar líneas, partir en trozos, redactar la
// instrucción para Gemini). La lectura del archivo y las llamadas de red están en el componente.

export type TextItem = { str: string; transform?: number[]; height?: number; hasEOL?: boolean };

/** Reconstruye líneas y párrafos a partir de los fragmentos de texto que entrega pdf.js. */
export function itemsToText(items: TextItem[]): string {
  const lines: { y: number; h: number; parts: { x: number; s: string }[] }[] = [];
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const x = it.transform?.[4] ?? 0;
    const y = it.transform?.[5] ?? 0;
    const h = it.height || Math.abs(it.transform?.[3] ?? 10) || 10;
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - y) < Math.max(2, h * 0.45)) last.parts.push({ x, s: it.str });
    else lines.push({ y, h, parts: [{ x, s: it.str }] });
  }
  const out: string[] = [];
  let prev: (typeof lines)[number] | null = null;
  for (const line of lines) {
    const text = line.parts.sort((a, b) => a.x - b.x).map((p) => p.s.trim()).join(" ").replace(/\s{2,}/g, " ").trim();
    if (!text) continue;
    if (prev && Math.abs(prev.y - line.y) > prev.h * 1.7) out.push("");
    out.push(text);
    prev = line;
  }
  return joinHyphenated(out.join("\n"));
}

/** "informa-\ntion" → "information". Solo cuando la línea siguiente empieza en minúscula. */
export function joinHyphenated(text: string): string {
  return text.replace(/([A-Za-z]{2,})-\n([a-z]{2,})/g, "$1$2");
}

/** Corta un texto en trozos de hasta `max` caracteres sin partir párrafos (ni oraciones si es posible). */
export function splitText(text: string, max = 5000): string[] {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];
  const units: string[] = [];
  for (const para of clean.split(/\n{2,}/)) {
    if (para.length <= max) { units.push(para); continue; }
    const sentences = para.split(/(?<=[.!?;:])\s+/);
    let cur = "";
    for (const s of sentences) {
      if (s.length > max) {
        if (cur) { units.push(cur); cur = ""; }
        for (let i = 0; i < s.length; i += max) units.push(s.slice(i, i + max));
      } else if ((cur + " " + s).trim().length > max) { units.push(cur); cur = s; }
      else cur = (cur + " " + s).trim();
    }
    if (cur) units.push(cur);
  }
  const chunks: string[] = [];
  let cur = "";
  for (const u of units) {
    if (cur && cur.length + u.length + 2 > max) { chunks.push(cur); cur = u; }
    else cur = cur ? `${cur}\n\n${u}` : u;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** Une los saltos de línea que solo son corte de renglón, pero respeta párrafos, viñetas y encabezados cortos. */
export function reflow(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    const startsItem = /^(\s*[-•*▪●]|\s*\d+[.)]\s|\s*[A-Z][A-Za-z ]{1,25}:\s)/.test(line);
    if (prev && prev.trim() && line.trim() && !startsItem && (prev.length >= 55 || /^[a-z(]/.test(line.trim())) && !/[.:;!?]$/.test(prev.trim())) out[out.length - 1] = `${prev.trimEnd()} ${line.trim()}`;
    else out.push(line);
  }
  return out.join("\n");
}

export function buildTranslationPrompt(text: string): string {
  return [
    "Eres traductor técnico de documentos médicos y de compras públicas. Traduce del inglés al español de Ecuador.",
    "Reglas: traduce todo, sin resumir ni agregar comentarios. Conserva números, fechas, unidades, códigos, referencias, marcas y nombres propios tal como están.",
    "Mantén los saltos de línea y los párrafos del original. Usa terminología médico-quirúrgica correcta (por ejemplo: implant = implante, sterile = estéril, single use = de un solo uso).",
    "Si algo es ilegible o dudoso, déjalo igual y márcalo con [revisar]. Devuelve únicamente el texto traducido.",
    "",
    "TEXTO:",
    text,
  ].join("\n");
}

/** Quita cercas de código o encabezados que a veces agrega el modelo. */
export function cleanModelOutput(text: string): string {
  return text.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").replace(/^(TEXTO TRADUCIDO|TRADUCCIÓN)\s*:\s*\n/i, "").trim();
}

export type TranslatedPage = { page: number; source: string; translated: string };

export function looksEnglish(text: string): boolean {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length < 20) return true; // muy poco texto: no se puede decidir
  const en = new Set(["the", "and", "of", "to", "is", "for", "with", "in", "this", "that", "be", "are", "by", "or", "not"]);
  const es = new Set(["el", "la", "de", "que", "y", "en", "los", "las", "del", "se", "para", "con", "por", "una", "un"]);
  let a = 0, b = 0;
  for (const w of words) { if (en.has(w)) a += 1; if (es.has(w)) b += 1; }
  return a >= b;
}
