// Lee comprobantes electrónicos del SRI (Ecuador) en XML: facturas, notas de crédito y comprobantes de
// retención, tanto el XML "pelado" como el que se descarga del portal envuelto en <autorizacion>.
// Sin dependencias: el formato del SRI es plano y estable, así que basta con extraer etiquetas.
import type { StockItem, StockMovement } from "./inventory-data";

export type SriKind = "factura" | "notaCredito" | "retencion";

export type SriLine = { code: string; description: string; quantity: number; unitPrice: number; discount: number; total: number };
export type SriWithholding = { tax: "renta" | "iva" | "isd" | "otro"; code: string; base: number; percent: number; amount: number; docRef: string };

export type SriDocument = {
  kind: SriKind;
  key: string; // clave de acceso (49 dígitos); identifica el comprobante sin repetirse
  number: string; // 001-001-000000123
  date: string; // YYYY-MM-DD
  issuerRuc: string;
  issuerName: string;
  buyerId: string;
  buyerName: string;
  subtotal: number; // sin impuestos y después de descuentos
  iva: number;
  total: number;
  modifiedDoc: string; // nota de crédito: factura que modifica
  lines: SriLine[];
  withholdings: SriWithholding[];
};

const ENTITIES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&amp;": "&" };
const decode = (s: string) => s.replace(/&(lt|gt|quot|apos|amp);/g, (m) => ENTITIES[m]).replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)));

/** Contenido de la primera etiqueta <name> (sin importar prefijos de espacio de nombres). */
function tag(xml: string, name: string): string {
  const m = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`).exec(xml);
  return m ? m[1] : "";
}
function tags(xml: string, name: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}
const text = (xml: string, name: string) => decode(tag(xml, name).replace(/<!\[CDATA\[|\]\]>/g, "")).trim();
const num = (xml: string, name: string) => {
  const v = Number(text(xml, name).replace(",", "."));
  return Number.isFinite(v) ? v : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** dd/mm/aaaa → aaaa-mm-dd */
export function sriDate(v: string) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(v.trim());
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}

/** Saca el comprobante del sobre <autorizacion><comprobante> (CDATA o texto escapado) si viene envuelto. */
export function unwrap(xml: string) {
  const inner = tag(xml, "comprobante");
  if (!inner) return xml;
  const cdata = /<!\[CDATA\[([\s\S]*?)\]\]>/.exec(inner);
  return cdata ? cdata[1] : decode(inner);
}

const IVA_CODE = "2"; // código de impuesto IVA en el SRI

function ivaFrom(totalConImpuestos: string) {
  return round2(tags(totalConImpuestos, "totalImpuesto").filter((t) => text(t, "codigo") === IVA_CODE).reduce((s, t) => s + num(t, "valor"), 0));
}

function withholdingTax(code: string): SriWithholding["tax"] {
  return code === "1" ? "renta" : code === "2" ? "iva" : code === "6" ? "isd" : "otro";
}

export function parseSriXml(raw: string): SriDocument | null {
  const xml = unwrap(raw.replace(/^﻿/, ""));
  const info = tag(xml, "infoTributaria");
  if (!info) return null;
  const number = [text(info, "estab"), text(info, "ptoEmi"), text(info, "secuencial")].filter(Boolean).join("-");
  const base = { key: text(info, "claveAcceso"), number, issuerRuc: text(info, "ruc"), issuerName: text(info, "razonSocial") || text(info, "nombreComercial") };

  if (/<(?:\w+:)?factura[\s>]/.test(xml)) {
    const f = tag(xml, "infoFactura");
    const lines = tags(tag(xml, "detalles"), "detalle").map((d) => ({
      code: text(d, "codigoPrincipal") || text(d, "codigoInterno"),
      description: text(d, "descripcion"),
      quantity: num(d, "cantidad"),
      unitPrice: num(d, "precioUnitario"),
      discount: num(d, "descuento"),
      total: num(d, "precioTotalSinImpuesto"),
    }));
    return {
      kind: "factura", ...base, date: sriDate(text(f, "fechaEmision")),
      buyerId: text(f, "identificacionComprador"), buyerName: text(f, "razonSocialComprador"),
      subtotal: num(f, "totalSinImpuestos"), iva: ivaFrom(tag(f, "totalConImpuestos")), total: num(f, "importeTotal"),
      modifiedDoc: "", lines, withholdings: [],
    };
  }
  if (/<(?:\w+:)?notaCredito[\s>]/.test(xml)) {
    const n = tag(xml, "infoNotaCredito");
    const lines = tags(tag(xml, "detalles"), "detalle").map((d) => ({
      code: text(d, "codigoInterno") || text(d, "codigoPrincipal"), description: text(d, "descripcion"),
      quantity: num(d, "cantidad"), unitPrice: num(d, "precioUnitario"), discount: num(d, "descuento"), total: num(d, "precioTotalSinImpuesto"),
    }));
    return {
      kind: "notaCredito", ...base, date: sriDate(text(n, "fechaEmision")),
      buyerId: text(n, "identificacionComprador"), buyerName: text(n, "razonSocialComprador"),
      subtotal: num(n, "totalSinImpuestos"), iva: ivaFrom(tag(n, "totalConImpuestos")), total: num(n, "valorModificacion"),
      modifiedDoc: text(n, "numDocModificado"), lines, withholdings: [],
    };
  }
  if (/<(?:\w+:)?comprobanteRetencion[\s>]/.test(xml)) {
    const r = tag(xml, "infoCompRetencion");
    const withholdings: SriWithholding[] = [];
    // Versión 1.0: <impuestos><impuesto> con numDocSustento por línea.
    for (const i of tags(tag(xml, "impuestos"), "impuesto")) {
      withholdings.push({ tax: withholdingTax(text(i, "codigo")), code: text(i, "codigoRetencion"), base: num(i, "baseImponible"), percent: num(i, "porcentajeRetener"), amount: num(i, "valorRetenido"), docRef: text(i, "numDocSustento") });
    }
    // Versión 2.0: <docsSustento><docSustento> con <retenciones><retencion>.
    for (const d of tags(tag(xml, "docsSustento"), "docSustento")) {
      const ref = text(d, "numDocSustento");
      for (const i of tags(tag(d, "retenciones"), "retencion")) {
        withholdings.push({ tax: withholdingTax(text(i, "codigo")), code: text(i, "codigoRetencion"), base: num(i, "baseImponible"), percent: num(i, "porcentajeRetener"), amount: num(i, "valorRetenido"), docRef: ref });
      }
    }
    const amount = round2(withholdings.reduce((s, w) => s + w.amount, 0));
    return {
      kind: "retencion", ...base, date: sriDate(text(r, "fechaEmision")),
      buyerId: text(r, "identificacionSujetoRetenido"), buyerName: text(r, "razonSocialSujetoRetenido"),
      subtotal: 0, iva: 0, total: amount, modifiedDoc: "", lines: [], withholdings,
    };
  }
  return null;
}

/** "001001000000123" o "001-001-000000123" → "001-001-000000123", para cruzar retenciones con facturas. */
export function normalizeDocNumber(v: string) {
  const d = (v || "").replace(/\D/g, "");
  return d.length === 15 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : (v || "").trim();
}

export type ImportPlan = {
  /** Movimientos nuevos para Finanzas. */
  records: { id: string; direction: "income" | "expense"; status: "pending"; date: string; dueDate: string; counterparty: string; document: string; category: string; costCenter: string; description: string; subtotal: number; iva: number; withholding: number; paymentMethod: string }[];
  /** Retenciones que hay que sumar a un movimiento que ya existe (por número de factura). */
  withholdings: { document: string; amount: number; detail: string }[];
  /** Compras que se pueden sumar al inventario. */
  purchases: { document: string; date: string; supplier: string; lines: SriLine[] }[];
  skipped: string[];
};

/**
 * Convierte comprobantes en movimientos de Finanzas desde el punto de vista de la empresa (ownRuc):
 * factura emitida = ingreso por cobrar; factura recibida = gasto por pagar (y compra para inventario);
 * nota de crédito = valor negativo; retención recibida = se descuenta de la factura que respalda.
 * `known` son las claves de acceso o números ya importados, para no duplicar.
 */
export function planImport(docs: SriDocument[], ownRuc: string, known: Set<string>, creditDays = 30): ImportPlan {
  const plan: ImportPlan = { records: [], withholdings: [], purchases: [], skipped: [] };
  const seen = new Set(known);
  const due = (iso: string) => {
    if (!iso) return iso;
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + creditDays);
    return d.toISOString().slice(0, 10);
  };
  for (const doc of docs) {
    const id = doc.key || `${doc.issuerRuc}-${doc.number}`;
    if (seen.has(id) || seen.has(`sri-${id}`)) { plan.skipped.push(`${doc.number} (ya importado)`); continue; }
    seen.add(id);
    const issued = doc.issuerRuc === ownRuc;
    const received = doc.buyerId === ownRuc;
    if (!issued && !received) { plan.skipped.push(`${doc.number} (no es de ${ownRuc})`); continue; }

    if (doc.kind === "retencion") {
      if (!received) { plan.skipped.push(`${doc.number} (retención emitida por Volia: regístrela como pago al SRI)`); continue; }
      const byDoc = new Map<string, number>();
      for (const w of doc.withholdings) byDoc.set(normalizeDocNumber(w.docRef), round2((byDoc.get(normalizeDocNumber(w.docRef)) ?? 0) + w.amount));
      for (const [document, amount] of byDoc) plan.withholdings.push({ document, amount, detail: `Retención ${doc.number} de ${doc.issuerName}` });
      continue;
    }
    const sign = doc.kind === "notaCredito" ? -1 : 1;
    const label = doc.kind === "notaCredito" ? "NC" : "FAC";
    const items = doc.lines.slice(0, 4).map((l) => l.description).join("; ") + (doc.lines.length > 4 ? ` y ${doc.lines.length - 4} más` : "");
    plan.records.push({
      id: `sri-${id}`,
      direction: issued ? "income" : "expense",
      status: "pending",
      date: doc.date,
      dueDate: due(doc.date),
      counterparty: issued ? doc.buyerName : doc.issuerName,
      document: `${label} ${doc.number}`,
      category: issued ? "Venta de insumos" : "Compra de inventario",
      costCenter: issued ? "Comercial" : "Inventario",
      description: `${doc.kind === "notaCredito" ? `Nota de crédito sobre ${doc.modifiedDoc}. ` : ""}${items}. Importado del XML del SRI (clave ${doc.key || "sin clave"}).`,
      subtotal: round2(sign * doc.subtotal),
      iva: round2(sign * doc.iva),
      withholding: 0,
      paymentMethod: "Transferencia",
    });
    if (received && doc.kind === "factura" && doc.lines.length) plan.purchases.push({ document: `FAC ${doc.number}`, date: doc.date, supplier: doc.issuerName, lines: doc.lines });
  }
  return plan;
}


const norm = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Suma al inventario las líneas de las facturas de compra: si el código (o el nombre exacto) ya existe,
 * aumenta su stock; si no, crea el producto en "Bodega". Cada línea deja un movimiento de entrada.
 */
export function applyPurchasesToStock(items: StockItem[], movements: StockMovement[], purchases: ImportPlan["purchases"], makeId: () => string) {
  const nextItems = items.map((i) => ({ ...i }));
  const newMovements: StockMovement[] = [];
  let created = 0;
  for (const p of purchases) {
    for (const l of p.lines) {
      const quantity = Math.max(0, Math.round(l.quantity));
      if (!quantity) continue;
      let item = nextItems.find((i) => (l.code && norm(i.code) === norm(l.code)) || norm(i.product) === norm(l.description));
      if (!item) {
        item = { id: makeId(), code: l.code, product: l.description, lot: "", expiry: "", location: "Bodega", stock: 0, reserved: 0, minimum: 0, unitCost: l.unitPrice };
        nextItems.push(item);
        created++;
      }
      item.stock = (Number(item.stock) || 0) + quantity;
      if (l.unitPrice > 0) item.unitCost = l.unitPrice;
      newMovements.push({ id: makeId(), date: p.date, type: "entry", itemId: item.id, code: item.code, product: item.product, quantity, unitCost: l.unitPrice, unitPrice: 0, note: `${p.document} · ${p.supplier}` });
    }
  }
  return { items: nextItems, movements: [...newMovements, ...movements], added: newMovements.length, created };
}
