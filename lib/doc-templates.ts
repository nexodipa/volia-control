// Plantillas que se llenan solas: la carta de autorización de marca (la que firma el representante del
// fabricante o distribuidor para un proceso concreto) y el autollenado del resto de documentos desde
// Procesos y Cirugías. Funciones puras: sin red ni navegador, para poder probarlas.
import type { RegulatoryRecord } from "./regulatory-data";
import type { Tender } from "./tenders";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-12-23" → "23 de diciembre del 2026" (así se escribe en las cartas); si no es una fecha, la devuelve igual. */
export function letterDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${Number(m[3])} de ${MONTHS[Number(m[2]) - 1]} del ${m[1]}` : iso || "";
}

/** Suma meses sin pasarse de fin de mes (31 de agosto + 2 meses = 31 de octubre; 31 de octubre + 4 = 28/29 de febrero). */
export function addMonths(iso: string, months: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return "";
  const total = Number(m[1]) * 12 + Number(m[2]) - 1 + months;
  const year = Math.floor(total / 12), month = total % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(Math.min(Number(m[3]), last)).padStart(2, "0")}`;
}

export type BrandLine = { brand: string; registrations: string[] };

/** Una marca por línea: "JUST MEDICAL | 18146-DME-0225" o "PERMEDICA | 17405-DME-1024, 17391-DME-1024". */
export function parseBrandLines(text: string): BrandLine[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [brand, rest = ""] = line.split("|");
      return { brand: brand.trim(), registrations: rest.split(/[,;]| y /).map((r) => r.trim()).filter(Boolean) };
    })
    .filter((b) => b.brand);
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Registros de Vigencias cuyo texto menciona la marca; sirve para proponer los números sin teclearlos. */
export function suggestRegistrations(brand: string, records: RegulatoryRecord[]): string[] {
  const needle = norm(brand).trim();
  if (needle.length < 3) return [];
  const found = records.filter((r) => (r.kind === "Registro sanitario" || r.kind === "Notificación sanitaria") && norm(`${r.subject} ${r.note} ${r.reference}`).includes(needle));
  return [...new Set(found.map((r) => r.reference))];
}

export type AuthorizationInput = {
  date: string;
  city: string;
  institution: string;
  distributor: string;
  distributorRuc: string;
  productLine: string;
  brands: BrandLine[];
  process: string;
  validUntil: string;
  signer: string;
  signerRole: string;
};

export type LetterBody = { salutation: string[]; intro: string; bullets: string[]; closing: string[]; signoff: string[] };

export function authorizationLetter(i: AuthorizationInput): LetterBody {
  const plural = i.brands.length > 1;
  const line = productLabel(i.productLine);
  return {
    salutation: ["Señores", i.institution.trim() || "[Institución contratante]", "Presente.-", "De mis consideraciones:"],
    intro: `Por medio de la presente certifico que ${i.distributor.trim() || "[distribuidor]"}${i.distributorRuc.trim() ? ` con RUC: ${i.distributorRuc.trim()}` : ""}, está autorizado a distribuir ${line} ${plural ? "de las siguientes marcas" : "de la siguiente marca"}:`,
    bullets: i.brands.map((b) => {
      const regs = b.registrations;
      const label = regs.length > 1 ? "Registros Sanitarios" : "Registro Sanitario";
      return regs.length ? `${b.brand} con ${label} ${joinList(regs)}` : `${b.brand} con Registro Sanitario [por completar]`;
    }),
    closing: [
      `${i.distributor.trim() || "[Distribuidor]"} cuenta con nuestro apoyo y cooperación para el buen manejo de nuestros productos y puede hacer uso de este certificado únicamente para el Proceso de Contratación Pública ${i.process.trim() || "[código del proceso]"}.`,
      `Esta carta de autorización es válida por el momento hasta el ${i.validUntil ? letterDate(i.validUntil) : "[fecha de vigencia]"}.`,
    ],
    signoff: ["Atentamente,", i.signer.trim() || "[Nombre del representante]", i.signerRole.trim() || "REPRESENTANTE"],
  };
}

function productLabel(line: string): string {
  const t = line.trim();
  return t ? (/^(los|las|el|la)\s/i.test(t) ? t : `los ${t}`) : "los productos";
}

/** Lo que aún falta para que la carta pueda mandarse a firmar. */
export function authorizationMissing(i: AuthorizationInput): string[] {
  const out: string[] = [];
  if (!i.distributor.trim()) out.push("empresa autorizada");
  if (!i.institution.trim()) out.push("institución contratante");
  if (!i.process.trim()) out.push("código del proceso");
  if (!i.brands.length) out.push("al menos una marca");
  const noReg = i.brands.filter((b) => !b.registrations.length).map((b) => b.brand);
  if (noReg.length) out.push(`registro sanitario de ${joinList(noReg)}`);
  if (!i.validUntil) out.push("fecha de vigencia");
  if (!i.signer.trim()) out.push("nombre de quien firma");
  return out;
}

export type PrefillCase = { patient: string; hospital: string; surgeryDate: string; contract: string; amount: number; invoice?: string };

/** Campos del generador que salen de una cirugía registrada. */
export function prefillFromCase(c: PrefillCase) {
  return {
    institution: c.hospital || "",
    patient: c.patient || "",
    surgeryDate: c.surgeryDate || "",
    contract: c.contract || "",
    amount: c.amount > 0 ? String(c.amount) : "",
    detail: c.invoice ? `Factura: ${c.invoice}` : "",
  };
}

/** Campos del generador que salen de un proceso en seguimiento. */
export function prefillFromTender(t: Pick<Tender, "ref" | "buyer" | "title">) {
  return { institution: t.buyer || "", contract: t.ref || "", process: t.ref || "", subject: t.title ? t.title.slice(0, 120) : "" };
}
