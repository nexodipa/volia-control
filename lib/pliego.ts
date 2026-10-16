// Lee el pliego de SERCOP (modelo "Subasta inversa electrónica", versión 2023-001 y similares) a partir
// del texto del PDF con posiciones (pdf.js) y devuelve los datos del proceso y la tabla 2.2 del
// presupuesto referencial: CPC, descripción, unidad, cantidad, precio unitario y total.
// Solo funciona con PDF que tienen texto; los escaneados necesitan OCR o IA.

export type PdfTextItem = { s: string; x: number; y: number; p: number };
export type PliegoItem = { item: number; cpc: string; description: string; unit: string; quantity: number; unitPrice: number; total: number };
export type Pliego = { code: string; entity: string; object: string; budget: number; items: PliegoItem[] };

/** "1.476,38000" → 1476.38; "6" → 6. Formato ecuatoriano: punto de miles, coma decimal. */
export function esNumber(v: string) {
  const t = (v || "").replace(/[^\d.,-]/g, "");
  if (!t) return NaN;
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t.replace(/\.(?=\d{3}(\D|$))/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Líneas de texto por página, en orden de lectura (útil para los datos de cabecera). */
function lines(items: PdfTextItem[]) {
  const byKey = new Map<string, PdfTextItem[]>();
  for (const it of items) {
    const key = `${it.p}:${Math.round(it.y / 3)}`;
    byKey.set(key, [...(byKey.get(key) ?? []), it]);
  }
  return [...byKey.values()]
    .map((row) => ({ p: row[0].p, y: row[0].y, text: clean(row.sort((a, b) => a.x - b.x).map((r) => r.s).join(" ")) }))
    .sort((a, b) => a.p - b.p || b.y - a.y);
}

type Columns = { cpc: number; desc: number; unit: number; qty: number; pu: number; pt: number };

export function parsePliego(items: PdfTextItem[]): Pliego {
  const ordered = [...items].sort((a, b) => a.p - b.p || b.y - a.y || a.x - b.x);
  const text = lines(ordered).map((l) => l.text).join("\n");

  const code = /C[ÓO]DIGO DEL PROCESO:?\s*([A-Z0-9][A-Z0-9-]+)/i.exec(text)?.[1] ?? "";
  const object = clean(/Objeto de (?:la )?Contrataci[óo]n\s*:?\s*[“"]\s*([\s\S]+?)\s*\.?\s*[”"]/i.exec(text)?.[1] ?? "");
  const head = text.split("\n").slice(0, 12);
  const codeLine = head.findIndex((l) => /C[ÓO]DIGO DEL PROCESO/i.test(l));
  const entity = clean(head.slice(0, Math.max(0, codeLine)).filter((l) => !/PLIEGO|BIENES Y\/O SERVICIOS|Versi[óo]n/i.test(l)).join(" "));
  const budgetText = /Presupuesto\s+referencial\s*:?\s*\$\s*([\d.,]*\d)/i.exec(text)?.[1] ?? "";
  const budget = esNumber(budgetText);

  // Tabla 2.2: columnas tomadas de los encabezados de cada página.
  const out: PliegoItem[] = [];
  let cols: Columns | null = null;
  let current: PliegoItem | null = null;
  let currentY = 0;
  let done = false;
  const pages = [...new Set(ordered.map((i) => i.p))];
  for (const page of pages) {
    if (done) break;
    const pageItems = ordered.filter((i) => i.p === page);
    const header = pageItems.find((i) => /^Descripci[óo]n del bien/i.test(i.s.trim()));
    if (header) {
      const at = (re: RegExp) => pageItems.find((i) => Math.abs(i.y - header.y) < 3 && re.test(i.s.trim()))?.x ?? NaN;
      const c = { cpc: at(/^C[óo]digo/i), desc: header.x, unit: at(/^Unidad/i), qty: at(/^Cantidad/i), pu: at(/^Precio Unitario/i), pt: at(/^Precio Total/i) };
      if (Object.values(c).every(Number.isFinite)) cols = c;
    }
    if (!cols) continue;
    const c = cols;
    const column = (x: number): keyof Columns => {
      // El texto de cada columna empieza cerca de su encabezado; las cifras van alineadas a la derecha, un poco después.
      const order: (keyof Columns)[] = ["cpc", "desc", "unit", "qty", "pu", "pt"];
      let chosen: keyof Columns = "cpc";
      for (const k of order) if (x + 18 >= c[k]) chosen = k;
      return chosen;
    };
    const body = header ? pageItems.filter((i) => i.y < header.y - 14) : pageItems;
    for (const it of body) {
      const s = it.s.trim();
      if (/^Total:?$/i.test(s) || /^2\.3\b/.test(s) || /^Especificaciones t[ée]cnicas/i.test(s) || /^P[áa]gina \d+\/\d+$/.test(s)) {
        if (/^Total:?$/i.test(s) || /^2\.3\b/.test(s)) { if (current) out.push(current); current = null; done = true; break; }
        continue;
      }
      const col = column(it.x);
      if (col === "cpc" && /^\d{6,10}$/.test(s) && (!current || Math.abs(it.y - currentY) > 3)) {
        if (current) out.push(current);
        current = { item: out.length + 1, cpc: s, description: "", unit: "", quantity: 0, unitPrice: 0, total: 0 };
        currentY = it.y;
        continue;
      }
      if (!current) continue;
      if (col === "cpc") { if (/^\d{1,3}$/.test(s)) current.cpc += s; continue; }
      if (col === "desc") current.description = clean(`${current.description} ${s}`);
      else if (col === "unit") current.unit = clean(`${current.unit} ${s}`);
      else if (col === "qty") current.quantity = esNumber(s) || current.quantity;
      else if (col === "pu") current.unitPrice = esNumber(s) || current.unitPrice;
      else if (col === "pt") current.total = esNumber(s) || current.total;
    }
  }
  if (current && !done) out.push(current);
  const items2 = out.filter((i) => i.description).map((i, k) => ({ ...i, item: k + 1, description: i.description.replace(/(\d)por ciento/g, "$1 por ciento").replace(/\s+,/g, ",") }));
  return { code, entity, object, budget: Number.isFinite(budget) ? budget : 0, items: items2 };
}

/** Texto con posiciones de un PDF, en el navegador (pdf.js). Lee como máximo `maxPages` páginas. */
export async function readPdfItems(file: File, maxPages = 15): Promise<PdfTextItem[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: PdfTextItem[] = [];
  for (let p = 1; p <= Math.min(doc.numPages, maxPages); p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      out.push({ s: it.str, x: it.transform[4], y: it.transform[5], p });
    }
  }
  return out;
}
