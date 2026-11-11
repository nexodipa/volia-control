// Propone fichas técnicas a partir de los ítems de un pliego o requerimiento. Nunca decide solo: para cada
// línea sugiere las fichas que ya existen (con su puntaje y avisos) o un borrador nuevo, y una persona confirma.
// Misma regla de seguridad que el motor de equivalencias: si las medidas no coinciden, la sugerencia se descarta.
import type { FichaProducto } from "./fichas.ts";
import { tokenize } from "./requirement-matcher.ts";

export type FichaCandidate = { id: string; nombre: string; score: number; avisos: string[] };
export type FichaBorrador = { nombre: string; composicion: string; descripcion: string };
export type FichaProposal = { line: string; quantity: number; candidates: FichaCandidate[]; draft: FichaBorrador };

const MATERIALES: Array<[RegExp, string]> = [
  [/entrecruzad|xlpe|cross.?link/i, "Polietileno entrecruzado"],
  [/uhmwpe|polietileno.{0,30}(ultra|alto peso)/i, "Polietileno de ultra alto peso molecular (UHMWPE)"],
  [/cromo\W*cobalto|\bcr\W?co\b|crco/i, "Cromo cobalto"],
  [/titanio|ti\W?6al\W?4v/i, "Aleación de titanio"],
  [/acero\s+inoxidable|316\s?l\b/i, "Acero inoxidable 316L"],
  [/\bpeek\b/i, "PEEK"],
  [/cer[aá]mica|al[uú]mina|zirconia/i, "Cerámica"],
];

/** Material que menciona el texto, o "" si no se reconoce ninguno. */
export function inferComposicion(text: string): string {
  return MATERIALES.find(([re]) => re.test(text))?.[1] ?? "";
}

/** Nombre corto en mayúsculas: lo que va antes de la primera coma, punto y coma, paréntesis o medida. */
export function draftName(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const cut = clean.search(/[,;:(]| - |\s\d/);
  const head = (cut > 0 ? clean.slice(0, cut) : clean).trim();
  return head.slice(0, 90).toUpperCase();
}

export function draftFromLine(text: string): FichaBorrador {
  const descripcion = text.replace(/\s+/g, " ").trim();
  return { nombre: draftName(descripcion), composicion: inferComposicion(descripcion), descripcion };
}

const isNumeric = (t: string) => /^\d+([./]\d+)?$/.test(t);

/** Qué parte del nombre de la ficha aparece en el texto del pliego (0 a 1). 0 si las medidas del nombre no coinciden. */
export function nameCoverage(line: string, ficha: FichaProducto): number {
  const nameTokens = [...new Set(tokenize(ficha.nombre))];
  if (!nameTokens.length) return 0;
  const lineTokens = new Set(tokenize(line));
  const nameNumbers = nameTokens.filter(isNumeric);
  const lineNumbers = [...lineTokens].filter(isNumeric);
  if (nameNumbers.length && lineNumbers.length && !nameNumbers.every((n) => lineTokens.has(n))) return 0;
  // Las medidas del nombre solo sirven para descartar; el parecido se mide con las palabras.
  const words = nameTokens.filter((t) => !isNumeric(t) && t !== "mm");
  return words.length ? words.filter((t) => lineTokens.has(t)).length / words.length : 0;
}

function avisosDe(line: string, ficha: FichaProducto): string[] {
  const avisos: string[] = [];
  const pedido = inferComposicion(line);
  const propia = inferComposicion(ficha.composicion);
  if (pedido && propia && pedido !== propia) avisos.push(`El pliego pide ${pedido.toLowerCase()} y la ficha dice ${ficha.composicion.toLowerCase()}.`);
  avisos.push("Compare las medidas del pliego con la tabla de la ficha.");
  return avisos;
}

export function proposeFichas(lines: Array<{ text: string; quantity: number }>, fichas: FichaProducto[], minScore = 0.6, maxCandidates = 3): FichaProposal[] {
  return lines.map((line) => {
    const candidates = fichas
      .map((f) => ({ f, score: nameCoverage(line.text, f) }))
      .filter((c) => c.score >= minScore)
      .sort((a, b) => b.score - a.score || a.f.nombre.localeCompare(b.f.nombre))
      .slice(0, maxCandidates)
      .map(({ f, score }) => ({ id: f.id, nombre: f.nombre, score: Math.round(score * 100) / 100, avisos: avisosDe(line.text, f) }));
    return { line: line.text, quantity: line.quantity, candidates, draft: draftFromLine(line.text) };
  });
}
