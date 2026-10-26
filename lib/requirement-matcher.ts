// Motor de equivalencias: relaciona lo que pide un cliente ("Aguja hipodérmica
// 23 G x 1 1/2") con un producto del catálogo.
//
// Reglas de seguridad:
//  1. Una equivalencia confirmada por una persona se aplica sola (via "alias").
//  2. Una coincidencia aproximada NUNCA se aplica sola: se propone y una
//     persona la confirma (via "similar"). Al confirmarla pasa a ser alias.
//  3. Si las medidas (números) no coinciden, la coincidencia se descarta:
//     una aguja de 21 G no puede sustituir a una de 23 G.

export type CatalogEntry = { id: number; code: string; name: string };
export type AliasEntry = { normalizedText: string; customerKey: string; productId: number };
export type MatchResult = {
  productId: number | null;
  via: "alias" | "similar" | "none";
  score: number;
  candidates: { productId: number; score: number }[];
};

const STOPWORDS = new Set([
  "de", "del", "la", "el", "los", "las", "y", "o", "con", "sin", "para", "en", "por",
  "un", "una", "x", "unidad", "unidades", "descartable", "descartables", "estéril", "esteril",
]);

export function normalizeRequirementText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/[^a-z0-9./\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Singular simple: "jeringas" y "jeringa", "guantes" y "guante", "sondas" y "sonda" cuentan como la misma palabra. */
function stem(t: string): string {
  if (t.length <= 4 || /\d/.test(t)) return t;
  return t.endsWith("s") ? t.slice(0, -1) : t;
}

export function tokenize(text: string): string[] {
  return normalizeRequirementText(text)
    .split(" ")
    .filter((t) => t && !STOPWORDS.has(t))
    .map(stem);
}

const isNumeric = (t: string) => /^\d+([./]\d+)?$/.test(t);

export function similarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;

  const numsA = new Set(ta.filter(isNumeric));
  const numsB = new Set(tb.filter(isNumeric));
  // Medidas: si ambos mencionan números, deben compartir todos los del más corto.
  if (numsA.size && numsB.size) {
    const [small, big] = numsA.size <= numsB.size ? [numsA, numsB] : [numsB, numsA];
    for (const n of small) if (!big.has(n)) return 0;
  }

  const setA = new Set(ta);
  const setB = new Set(tb);
  let shared = 0;
  for (const t of setA) if (setB.has(t)) shared += 1;
  return shared / (setA.size + setB.size - shared);
}

export function matchRequirement(
  text: string,
  catalog: CatalogEntry[],
  aliases: AliasEntry[],
  options: { customerKey?: string; minScore?: number; maxCandidates?: number } = {},
): MatchResult {
  const customerKey = options.customerKey ?? "";
  const minScore = options.minScore ?? 0.5;
  const maxCandidates = options.maxCandidates ?? 3;
  const normalized = normalizeRequirementText(text);

  const alias =
    aliases.find((a) => a.normalizedText === normalized && a.customerKey === customerKey) ??
    aliases.find((a) => a.normalizedText === normalized && a.customerKey === "");
  if (alias) {
    return { productId: alias.productId, via: "alias", score: 1, candidates: [] };
  }

  const candidates = catalog
    .map((p) => ({ productId: p.id, score: similarity(text, p.name) }))
    .filter((c) => c.score >= minScore)
    .sort((x, y) => y.score - x.score)
    .slice(0, maxCandidates);

  if (!candidates.length) return { productId: null, via: "none", score: 0, candidates: [] };
  return { productId: null, via: "similar", score: candidates[0].score, candidates };
}
