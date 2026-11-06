// Compara el archivo de mercado anterior con el recién generado. Falla si se perdió más del 10 % de los procesos.
import { readFileSync } from "node:fs";
const [anterior, nuevo] = process.argv.slice(2);
const count = (f) => JSON.parse(readFileSync(f, "utf8")).processes.length;
const before = count(anterior), now = count(nuevo);
console.log(`Procesos antes: ${before}, ahora: ${now}`);
if (before && now < before * 0.9) { console.error("Menos del 90 % de los procesos anteriores: se descarta la actualización."); process.exit(1); }
