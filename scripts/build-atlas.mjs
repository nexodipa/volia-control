// Compila el Atlas aparte (atlas-aparte/dist). Prepara tres cosas antes de llamar a Vite:
//  1. los estilos del atlas, tomados de app/globals.css (así hay una sola fuente de verdad);
//  2. una copia del catálogo HECAM SIN precios, cantidades, presupuestos ni contratistas;
//  3. los íconos y la fuente que ya usa Volia Control.
// Uso: node scripts/build-atlas.mjs
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const app = join(root, "atlas-aparte");
const fail = (m) => { console.error(`\n✖ ${m}`); process.exit(1); };

// 1. Estilos del atlas: desde el comentario de encabezado hasta el final de globals.css.
const css = readFileSync(join(root, "app", "globals.css"), "utf8");
const marker = "/* ---------- Atlas de osteosíntesis ---------- */";
const at = css.indexOf(marker);
if (at < 0) fail("No se encontró el bloque de estilos del atlas en app/globals.css.");
writeFileSync(join(app, "src", "atlas.generated.css"), `${css.slice(at)}\n`);

// 2. Catálogo público: solo código, nombre, presentación y especialidad (el atlas la usa para elegir los ítems de Traumatología).
const hecam = JSON.parse(readFileSync(join(root, "public", "data", "hecam-2026.json"), "utf8"));
const items = hecam.items.map((i) => ({ c: i.c, n: i.n, ...(i.u ? { u: i.u } : {}), ...(i.e ? { e: i.e } : {}) }));
const outData = join(app, "public", "data");
mkdirSync(outData, { recursive: true });
writeFileSync(join(outData, "hecam-catalogo.json"), JSON.stringify({ fuente: hecam.fuente, items }));
const sensible = /"(pur|prt|pua|q|cm|g)":/;
if (sensible.test(readFileSync(join(outData, "hecam-catalogo.json"), "utf8"))) fail("El catálogo público conserva campos con precios o contratistas.");

// 3. Íconos y fuente.
mkdirSync(join(app, "public", "fonts"), { recursive: true });
for (const f of ["app-icon-192.png", "app-icon-512.png", "app-icon-maskable-512.png", "app-icon.svg", "apple-touch-icon.png", "favicon.svg"]) {
  copyFileSync(join(root, "public", f), join(app, "public", f));
}
const font = "figtree-latin-wght-normal.woff2";
if (existsSync(join(root, "public", "fonts", font))) copyFileSync(join(root, "public", "fonts", font), join(app, "public", "fonts", font));

// 4. Vite.
const isWin = process.platform === "win32";
const res = spawnSync(isWin ? "npx.cmd" : "npx", ["vite", "build", "--config", join(app, "vite.config.ts")], { cwd: root, stdio: "inherit", shell: isWin });
if (res.status !== 0) fail("Falló la compilación del Atlas.");
console.log(`\n✔ Atlas compilado en ${join(app, "dist")} (${items.length} ítems en el catálogo público, sin precios).`);
