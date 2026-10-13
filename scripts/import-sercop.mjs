// Importa contrataciones abiertas de SERCOP (OCDS, .jsonl.gz) y deja solo los ítems de los CPC de Volia.
// Uso: node scripts/import-sercop.mjs <ruta/2026.jsonl.gz> [salida.csv] [prefijos CPC separados por coma]
// Por defecto filtra el CPC 352901091 (insumos médicos del informe de necesidad).
import { createReadStream, createWriteStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { extractMarketItems } from "../lib/ocds.ts";

const [input, output = "sercop-mercado.csv", prefixArg = "352901091"] = process.argv.slice(2);
if (!input) { console.error("Falta la ruta del archivo .jsonl.gz"); process.exit(1); }
const prefixes = prefixArg.split(",").map((p) => p.trim()).filter(Boolean);
const csv = (v) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const cols = ["ocid", "date", "buyer", "method", "status", "cpc", "description", "quantity", "unit", "referenceUnitPrice", "awardedSupplier", "awardedUnitPrice"];

const out = createWriteStream(output);
out.write(cols.join(",") + "\n");
const stream = input.endsWith(".gz") ? createReadStream(input).pipe(createGunzip()) : createReadStream(input);
const rl = createInterface({ input: stream, crlfDelay: Infinity });
let lines = 0, kept = 0, bad = 0;
for await (const line of rl) {
  if (!line.trim()) continue;
  lines++;
  let doc;
  try { doc = JSON.parse(line); } catch { bad++; continue; }
  const releases = Array.isArray(doc.releases) ? doc.releases : doc.compiledRelease ? [doc.compiledRelease] : [doc];
  for (const rel of releases) for (const it of extractMarketItems(rel, prefixes)) { out.write(cols.map((c) => csv(it[c])).join(",") + "\n"); kept++; }
  if (lines % 50000 === 0) console.error(`${lines} procesos leídos, ${kept} ítems retenidos`);
}
out.end();
console.error(`Listo: ${lines} procesos, ${kept} ítems con CPC ${prefixes.join("/")}, ${bad} líneas inválidas -> ${output}`);
