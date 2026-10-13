// Resumen a nivel proceso de las contrataciones SERCOP relevantes para Volia (insumos, dispositivos, traumatología)
// y de todos los procesos donde Volia ofertó. Genera dos CSV.
// Uso: node scripts/sercop-processes.mjs <archivo.jsonl.gz> <carpeta de salida> [nombre propio, por defecto VOLIA]
import { createReadStream, createWriteStream, mkdirSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { join } from "node:path";
import { isRelevantProcess, summarizeProcess } from "../lib/ocds.ts";

const [input, outDir = ".", ourName = "VOLIA"] = process.argv.slice(2);
if (!input) { console.error("Falta la ruta del archivo .jsonl.gz"); process.exit(1); }
mkdirSync(outDir, { recursive: true });
const cols = ["ocid", "date", "buyer", "method", "status", "description", "budget", "tenderers", "winners", "awardedAmount", "weBid", "weWon"];
const csv = (v) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const market = createWriteStream(join(outDir, "procesos-medicos.csv"));
const ours = createWriteStream(join(outDir, `procesos-${ourName.toLowerCase()}.csv`));
for (const w of [market, ours]) w.write(cols.join(",") + "\n");
const rl = createInterface({ input: createReadStream(input).pipe(createGunzip()), crlfDelay: Infinity });
let n = 0, kept = 0, bid = 0, won = 0;
for await (const line of rl) {
  if (!line.trim()) continue;
  n++;
  let rel; try { rel = JSON.parse(line); } catch { continue; }
  if (!isRelevantProcess(rel, undefined, ourName)) continue;
  const s = summarizeProcess(rel, ourName);
  const row = cols.map((c) => csv(s[c])).join(",") + "\n";
  market.write(row); kept++;
  if (s.weBid) { ours.write(row); bid++; if (s.weWon) won++; }
}
market.end(); ours.end();
console.error(`Listo: ${n} procesos leídos, ${kept} relevantes; ${ourName} ofertó en ${bid} y ganó ${won}.`);
