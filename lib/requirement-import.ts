// Importación de requerimientos pegados (desde Excel, un pliego o un correo) hacia líneas de cotización.
// Usa el motor de equivalencias: lo confirmado se aplica solo, lo parecido se propone y una persona decide.
import { aliasId } from "./shared-adapters.ts";
import { matchRequirement, normalizeRequirementText, type AliasEntry, type CatalogEntry } from "./requirement-matcher.ts";

export type RequirementLine = { text: string; quantity: number; raw: string };
export type StoredAlias = { id?: string; normalizedText: string; customerKey: string; code: string; confirmedAt: string };
export type ImportCatalogItem = { code: string; description: string };
export type LineMatch = RequirementLine & {
  via: "alias" | "similar" | "none";
  code: string | null; // producto aplicado (solo con alias)
  candidates: { code: string; score: number }[];
};

const isNumber = (s: string) => /^\d+([.,]\d+)?$/.test(s.trim());
const isCodeLike = (s: string) => /^[A-Z0-9][A-Z0-9._\-/]*$/.test(s.trim()) && /\d/.test(s) && !/\s/.test(s.trim());
const hasLetters = (s: string) => /[a-záéíóúñ]{3,}/i.test(s);
const toQty = (s: string) => { const n = Math.round(Number(s.trim().replace(",", "."))); return Number.isFinite(n) && n > 0 ? n : null; };

/**
 * Convierte texto pegado en líneas. Con columnas (tabulador o ";"): la descripción es la primera celda con texto
 * que no sea un código, y la cantidad el primer entero que aparece después. Sin columnas: "10 jeringas…" o "… x 10".
 */
export function parseRequirementText(input: string): RequirementLine[] {
  const lines: RequirementLine[] = [];
  for (const raw of input.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const cells = (trimmed.includes("\t") ? trimmed.split("\t") : trimmed.includes(";") ? trimmed.split(";") : [trimmed]).map((c) => c.trim());
    let text = "";
    let quantity: number | null = null;
    if (cells.length > 1) {
      const headerWords = cells.filter((c) => /^(no\.?|cantidad|producto|descripci[oó]n|unidad de medida|especificaciones( t[eé]cnicas)?|cpc.*|cudim|[ií]tem)$/i.test(c));
      if (headerWords.length >= 2) continue; // fila de encabezados
      const idx = cells.findIndex((c) => hasLetters(c) && !isCodeLike(c));
      if (idx === -1) continue;
      text = cells[idx];
      for (const c of cells.slice(idx + 1)) if (isNumber(c) && toQty(c) !== null && !c.includes(".") && !c.includes(",")) { quantity = toQty(c); break; }
    } else {
      const lead = trimmed.match(/^(\d+)\s+(.+)$/);
      const tail = trimmed.match(/^(.+?)\s*(?:x|por|cant\.?|cantidad:?)\s*(\d+)\s*$/i);
      if (lead && hasLetters(lead[2])) { quantity = toQty(lead[1]); text = lead[2]; }
      else if (tail && hasLetters(tail[1])) { quantity = toQty(tail[2]); text = tail[1]; }
      else text = trimmed;
    }
    if (!hasLetters(text)) continue;
    if (/^(producto|descripci[oó]n|item|ítem|no\.?)$/i.test(text)) continue; // fila de encabezados
    lines.push({ text: text.replace(/\s+/g, " "), quantity: quantity ?? 1, raw: trimmed });
  }
  return lines;
}

export const customerKeyOf = (customer: string) => normalizeRequirementText(customer);

export function matchLines(lines: RequirementLine[], catalog: ImportCatalogItem[], aliases: StoredAlias[], customer: string): LineMatch[] {
  const entries: CatalogEntry[] = catalog.map((p, i) => ({ id: i, code: p.code, name: p.description }));
  const indexOf = new Map(catalog.map((p, i) => [p.code, i]));
  const aliasEntries: AliasEntry[] = aliases.filter((a) => indexOf.has(a.code)).map((a) => ({ normalizedText: a.normalizedText, customerKey: a.customerKey, productId: indexOf.get(a.code)! }));
  const customerKey = customerKeyOf(customer);
  return lines.map((line) => {
    const m = matchRequirement(line.text, entries, aliasEntries, { customerKey, minScore: 0.34, maxCandidates: 3 });
    return {
      ...line,
      via: m.via,
      code: m.via === "alias" && m.productId !== null ? catalog[m.productId].code : null,
      candidates: m.candidates.map((c) => ({ code: catalog[c.productId].code, score: Math.round(c.score * 100) / 100 })),
    };
  });
}

/** Agrega o reemplaza la equivalencia confirmada para este texto y cliente. */
export function rememberAlias(aliases: StoredAlias[], text: string, customer: string, code: string, now = new Date().toISOString()): StoredAlias[] {
  const normalizedText = normalizeRequirementText(text);
  const customerKey = customerKeyOf(customer);
  const rest = aliases.filter((a) => !(a.normalizedText === normalizedText && a.customerKey === customerKey));
  return [{ id: aliasId({ customerKey, normalizedText }), normalizedText, customerKey, code, confirmedAt: now }, ...rest];
}
