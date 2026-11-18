// Clasificación y extracción de datos de correos. Funciones puras y sin IA: reglas legibles que se pueden auditar.
// Los correos llegan ya filtrados por quien los etiquetó (ver docs/correo.md); aquí solo se decide de qué trata cada
// uno y qué datos útiles trae (códigos de proceso, montos, fechas límite, facturas, RUC).

export type MailCategory = "sercop" | "cotizacion" | "pedido" | "cobro_pago" | "regulatorio" | "proveedor" | "otro";

export const MAIL_CATEGORIES: Record<MailCategory, { label: string; hint: string }> = {
  sercop: { label: "Contratación pública", hint: "Procesos, preguntas, adjudicaciones y notificaciones del SERCOP" },
  cotizacion: { label: "Cotizaciones", hint: "Solicitudes de cotización o proforma" },
  pedido: { label: "Pedidos", hint: "Órdenes de compra y entregas" },
  cobro_pago: { label: "Cobros y pagos", hint: "Facturas, pagos, retenciones y abonos" },
  regulatorio: { label: "Regulatorio", hint: "ARCSA, registros sanitarios y permisos" },
  proveedor: { label: "Proveedores", hint: "Listas de precios, catálogos y ofertas" },
  otro: { label: "Otros", hint: "No encaja en ninguna categoría" },
};

export type MailInput = { from: string; subject: string; body: string; attachments?: { name: string }[] };

export type MailFields = {
  processCodes: string[];
  amounts: number[];
  dates: string[]; // ISO, todas las fechas halladas
  deadline: string; // ISO de la fecha límite más cercana que acompaña a «plazo», «hasta», «vence»…; "" si no hay
  invoices: string[];
  rucs: string[];
};

export type MailTriage = {
  category: MailCategory;
  confidence: number; // 0 a 1
  reasons: string[]; // términos que decidieron la categoría
  sender: { name: string; email: string; domain: string };
  fields: MailFields;
  excerpt: string; // inicio del mensaje, sin citas ni datos sensibles
};

const fold = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ---------------------------------------------------------------- reglas

type Rule = [pattern: RegExp, weight: number, label: string];

const RULES: Record<Exclude<MailCategory, "otro">, Rule[]> = {
  sercop: [
    [/subasta inversa|puja|menor cuantia|cotizacion y contratacion|licitacion|catalogo electronico|infima cuantia|regimen especial/, 4, "tipo de proceso"],
    [/sercop|compraspublicas|compras publicas|portal institucional|sistema oficial de contratacion/, 4, "SERCOP"],
    [/pliego|convocatoria|oferta tecnica|calendario del proceso|preguntas y respuestas|aclaraciones|adjudicacion|adjudicad|fecha limite de entrega de propuestas|cronograma/, 3, "etapa de proceso"],
    [/entidad contratante|proveedor adjudicado|acta de/, 2, "contratación"],
  ],
  cotizacion: [
    [/cotizacion|cotizar|proforma|solicitud de oferta|presupuesto referencial|sirvase (?:cotizar|enviar)|requerimiento de/, 4, "cotización"],
    [/precio unitario|precios? (?:de|para)|valor unitario|disponibilidad y precio/, 2, "precios"],
    [/solicito|requerimos|necesitamos/, 1, "solicitud"],
  ],
  pedido: [
    [/orden de compra|orden de pedido|oc[- ]?\d|pedido n|nro\.? de pedido|adjuntamos (?:la )?orden/, 5, "orden de compra"],
    [/guia de remision|despacho|entrega de (?:los|las|su)|fecha de entrega|recepcion de/, 3, "entrega"],
    [/pedido|ordenar|orden/, 1, "pedido"],
  ],
  cobro_pago: [
    [/factura|comprobante de retencion|retencion|nota de credito|nota de debito/, 4, "comprobante"],
    [/pago|transferencia|abono|deposito|cancelacion de|cuenta por cobrar|saldo pendiente|vencid[ao]|mora/, 3, "pago"],
    [/\$\s?\d|usd\s?\d|monto|valor a pagar/, 1, "monto"],
  ],
  regulatorio: [
    [/arcsa|agencia nacional de regulacion|control sanitario|registro sanitario|notificacion sanitaria|permiso de funcionamiento|buenas practicas de/, 5, "ARCSA"],
    [/renovacion|vigencia|caducidad|certificado de|licencia sanitaria|vigilancia sanitaria|dispositivo medico/, 2, "vigencia"],
  ],
  proveedor: [
    [/lista de precios|listado de precios|catalogo|ficha tecnica|nueva linea|novedades|promocion|oferta especial|disponibilidad|stock/, 3, "oferta de proveedor"],
    [/representante|distribuidor|fabricante/, 1, "proveedor"],
  ],
};

// Dominios que, por sí solos, indican la categoría.
const DOMAIN_HINTS: [RegExp, MailCategory, number][] = [
  [/(?:^|\.)compraspublicas\.gob\.ec$|(?:^|\.)sercop\.gob\.ec$/, "sercop", 8],
  [/(?:^|\.)controlsanitario\.gob\.ec$|(?:^|\.)arcsa\.gob\.ec$/, "regulatorio", 8],
  [/(?:^|\.)sri\.gob\.ec$/, "cobro_pago", 5],
];

// ---------------------------------------------------------------- extracción

/** Código de proceso del SERCOP: SIE-HEEE-2026-049-52558, RE-PU-HG-IB-2026-010-3260, LICO-… Verificado con 1.229 códigos reales. */
const PROCESS_CODE = /\b[A-Z]{2,5}(?:-{1,2}[A-Z0-9_]{1,40}){1,6}(?:-{1,2}|(?<=[A-Z]))20\d{2}(?:-[A-Z0-9]{1,8}){1,3}\b/g;
const INVOICE = /\b\d{3}-\d{3}-\d{9}\b/g;
const RUC = /\b\d{10}001\b/g;
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function parseAmount(raw: string): number {
  const s = raw.replace(/\s/g, "");
  const lastDot = s.lastIndexOf("."), lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) normalized = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lastComma >= 0) normalized = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  else if (lastDot >= 0) normalized = /\.\d{1,2}$/.test(s) && (s.match(/\./g) ?? []).length === 1 ? s : s.replace(/\./g, "");
  else normalized = s;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function isoDate(y: number, m: number, d: number): string {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return "";
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 ? date.toISOString().slice(0, 10) : "";
}

type Found = { iso: string; at: number };
function findDates(text: string): Found[] {
  const out: Found[] = [];
  const t = fold(text);
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.push({ iso: isoDate(+m[1], +m[2], +m[3]), at: m.index ?? 0 });
  for (const m of t.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g)) out.push({ iso: isoDate(+m[3], +m[2], +m[1]), at: m.index ?? 0 });
  for (const m of t.matchAll(new RegExp(`\\b(\\d{1,2}) de (${MONTHS.join("|")})(?: (?:de|del))? (\\d{4})\\b`, "g"))) out.push({ iso: isoDate(+m[3], MONTHS.indexOf(m[2]) + 1, +m[1]), at: m.index ?? 0 });
  return out.filter((d) => d.iso).sort((a, b) => a.at - b.at);
}

/** Lo que identifica al remitente: «Hospital X <compras@hospital.gob.ec>» o solo la dirección. */
export function parseSender(from: string) {
  const email = (from.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? "").toLowerCase();
  const name = from.replace(/<[^>]*>/g, "").replace(/["']/g, "").trim() || email;
  return { name: name.slice(0, 120), email, domain: email.split("@")[1] ?? "" };
}

/** Quita el texto citado de respuestas anteriores y la firma, y enmascara datos que no deben guardarse. */
export function cleanBody(body: string): string {
  const lines = body.replace(/\r/g, "").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^(?:-{2,}\s*(?:mensaje original|original message)|on .+ wrote:|el .+ escribi[oó]:|de:\s|from:\s)/i.test(t)) break; // empieza lo citado
    if (t.startsWith(">")) continue;
    kept.push(line);
  }
  return redact(kept.join("\n")).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Contraseñas, claves y números de tarjeta (13 a 19 dígitos seguidos que no son RUC ni factura) no se guardan. */
export function redact(text: string): string {
  return text
    .replace(/((?:contrase[nñ]a|clave|password|pin|cvv|codigo de (?:verificacion|seguridad))\s*(?:es|:|=)?\s*)\S+/gi, "$1[oculto]")
    .replace(/\b\d{13,19}\b/g, (m) => (/^\d{10}001$/.test(m) ? m : "[número oculto]"))
    .replace(/\b(?:\d[ -]?){15}\d\b/g, "[número oculto]");
}

export function extractFields(text: string): MailFields {
  const upper = text.toUpperCase();
  const dates = findDates(text);
  const keyword = /(?:plazo|fecha limite|hasta el|hasta|vence|vencimiento|entregar|entrega|cierre|presentar)/;
  const folded = fold(text);
  const deadline = dates.find((d) => keyword.test(folded.slice(Math.max(0, d.at - 60), d.at)))?.iso ?? "";
  return {
    processCodes: [...new Set(upper.match(PROCESS_CODE) ?? [])].slice(0, 8),
    amounts: [...new Set([...text.matchAll(/(?:\$|usd|us\$)\s*([\d][\d.,]*\d|\d)/gi)].map((m) => parseAmount(m[1])).filter((n) => n > 0))].slice(0, 8),
    dates: [...new Set(dates.map((d) => d.iso))].slice(0, 8),
    deadline,
    invoices: [...new Set(text.match(INVOICE) ?? [])].slice(0, 8),
    rucs: [...new Set(text.match(RUC) ?? [])].slice(0, 4),
  };
}

// ---------------------------------------------------------------- clasificación

export function classifyMail(mail: MailInput): MailTriage {
  const sender = parseSender(mail.from);
  const body = cleanBody(mail.body);
  const subject = fold(mail.subject);
  const text = fold(body);
  const fields = extractFields(`${mail.subject}\n${body}`);

  const scores = new Map<MailCategory, number>();
  const reasons = new Map<MailCategory, string[]>();
  const add = (cat: MailCategory, points: number, why: string) => {
    scores.set(cat, (scores.get(cat) ?? 0) + points);
    const list = reasons.get(cat) ?? [];
    if (!list.includes(why)) list.push(why);
    reasons.set(cat, list);
  };
  for (const [cat, rules] of Object.entries(RULES) as [Exclude<MailCategory, "otro">, Rule[]][]) {
    for (const [re, weight, why] of rules) {
      if (re.test(subject)) add(cat, weight * 2, `asunto: ${why}`); // el asunto pesa el doble
      else if (re.test(text)) add(cat, weight, why);
    }
  }
  for (const [re, cat, weight] of DOMAIN_HINTS) if (re.test(sender.domain)) add(cat, weight, `remitente ${sender.domain}`);
  if (fields.processCodes.length) add("sercop", 5, "código de proceso");
  if (fields.invoices.length) add("cobro_pago", 3, "número de factura");
  for (const a of mail.attachments ?? []) {
    const n = fold(a.name);
    if (/factura|retencion/.test(n)) add("cobro_pago", 4, "adjunto de factura");
    else if (/proforma|cotizacion/.test(n)) add("cotizacion", 4, "adjunto de cotización");
    else if (/orden.?de.?compra|\boc[-_ ]?\d/.test(n)) add("pedido", 4, "adjunto de orden de compra");
    else if (/lista.?de.?precios|catalogo|ficha.?tecnica/.test(n)) add("proveedor", 4, "adjunto de catálogo");
    else if (/pliego|arcsa|registro.?sanitario/.test(n)) add(/pliego/.test(n) ? "sercop" : "regulatorio", 4, "adjunto de pliego o registro");
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const [top, second] = [ranked[0], ranked[1]];
  const category: MailCategory = top && top[1] >= 4 ? top[0] : "otro";
  const confidence = category === "otro" || !top ? 0 : Math.round((top[1] / (top[1] + (second?.[1] ?? 0) + 2)) * 100) / 100;
  return {
    category, confidence, sender, fields,
    reasons: category === "otro" ? [] : (reasons.get(category) ?? []).slice(0, 4),
    excerpt: body.replace(/\s+/g, " ").slice(0, 600),
  };
}
