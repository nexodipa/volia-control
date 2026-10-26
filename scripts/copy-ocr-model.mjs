import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const models = [
  ["spa", "español"],
  ["eng", "inglés"],
];

for (const [code, name] of models) {
  const source = resolve(root, `node_modules/@tesseract.js-data/${code}/4.0.0_best_int/${code}.traineddata.gz`);
  const target = resolve(root, `public/${code}.traineddata.gz`);
  if (!existsSync(source)) throw new Error(`No se encontró el modelo OCR ${name} instalado.`);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  console.log(`Modelo OCR ${name} preparado en public/${code}.traineddata.gz`);
}
