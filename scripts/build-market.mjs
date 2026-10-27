// Regenera public/data/mercado-sercop-<año>.json a partir del archivo de Contrataciones Abiertas del
// SERCOP (OCDS, .jsonl.gz) que se descarga una vez al mes. Deja solo los procesos de insumos,
// dispositivos médicos y traumatología, más todos donde Volia ofertó, con el último estado de cada uno.
// Uso: node scripts/build-market.mjs <archivo.jsonl.gz> [salida.json] [nombre propio]
import { createReadStream, writeFileSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { isRelevantProcess, summarizeProcess } from "../lib/ocds.ts";

const [input, output, ourName = "VOLIA"] = process.argv.slice(2);
// Si el archivo trae varios años ("todos los años"), solo se guarda el año en curso (o MARKET_YEAR=2025).
const WANT_YEAR = process.env.MARKET_YEAR || String(new Date().getFullYear());
if (!input) { console.error("Uso: node scripts/build-market.mjs <archivo.jsonl.gz> [salida.json]"); process.exit(1); }

const methodOf = (details) =>
  /subasta inversa/i.test(details) ? "SIE" : /licitaci/i.test(details) ? "LIC" : /cat[aá]logo/i.test(details) ? "CAT" : /bienes y servicios [uú]nicos/i.test(details) ? "BSU" : "OTRO";
const TRAUMA = /traumatolog|osteos[ií]ntesis|ortop[eé]d|pr[oó]tesis|implante/i;

// Provincia del comprador según la fuente OCDS (parties[].address.region); vacío si el archivo no la trae.
const regionOf = (rel) => {
  const parties = Array.isArray(rel.parties) ? rel.parties : [];
  const buyer = parties.find((x) => x.id && x.id === rel.buyer?.id) ?? parties.find((x) => Array.isArray(x.roles) && x.roles.includes("buyer"));
  return String(buyer?.address?.region ?? "").trim();
};

const byId = new Map();
let read = 0;
let year = "";
const stream = input.endsWith(".gz") ? createReadStream(input).pipe(createGunzip()) : createReadStream(input);
for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) {
  if (!line.trim()) continue;
  read++;
  let rel;
  try { rel = JSON.parse(line); } catch { continue; }
  if (rel.compiledRelease) rel = rel.compiledRelease;
  if (!isRelevantProcess(rel, undefined, ourName)) continue;
  const s = summarizeProcess(rel, ourName);
  if (!String(s.date).startsWith(WANT_YEAR)) continue;
  const id = String(rel.ocid ?? "").replace(/^ocds-[a-z0-9]+-/i, "");
  if (!id) continue;
  const prev = byId.get(id);
  if (prev && prev.d > s.date) continue; // se queda la versión más reciente del proceso
  const t = rel.tender ?? {};
  year = year || s.date.slice(0, 4);
  byId.set(id, {
    id,
    d: s.date,
    b: s.buyer,
    m: methodOf(String(t.procurementMethodDetails ?? "")),
    s: s.status,
    c: TRAUMA.test(`${t.title ?? ""} ${t.description ?? ""}`) ? "trauma" : "insumos",
    t: s.description.slice(0, 240),
    p: s.budget,
    o: s.tenderers,
    w: s.winners,
    a: s.awardedAmount,
    vb: s.weBid,
    vw: s.weWon,
    ...(regionOf(rel) ? { r: regionOf(rel) } : {}),
  });
}
const processes = [...byId.values()].sort((a, b) => b.d.localeCompare(a.d) || a.id.localeCompare(b.id));
const out = output || `public/data/mercado-sercop-${WANT_YEAR}.json`;
writeFileSync(out, JSON.stringify({
  source: "SERCOP, Contrataciones Abiertas OCDS (data.open-contracting.org/en/publication/110), licencia CC BY 3.0 EC",
  generatedAt: new Date().toISOString().slice(0, 10),
  processes,
}));
// Archivo mínimo con la fecha: Inicio lo lee sin bajar los 400 KB del mercado completo.
writeFileSync(out.replace(/mercado-sercop-\d+\.json$/, "mercado-meta.json"), JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), processes: processes.length }));
const ours = processes.filter((p) => p.vb).length;
const withRegion = processes.filter((p) => p.r).length;
console.log(`Listo: ${read} registros leídos, ${processes.length} procesos de mercado (${ours} con oferta de ${ourName}). Guardado en ${out}. Con provincia en la fuente: ${withRegion}.`);
