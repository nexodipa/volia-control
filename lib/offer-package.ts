// Paquete de oferta para procesos SERCOP: a partir de una cotización arma los textos y tablas de los
// documentos que Volia presenta en cada proceso (carta de presentación, declaración de integridad,
// cartas de compromiso de compra por proveedor, componente de los bienes ofertados y control de respaldos).
// Funciones puras: la generación del Word vive en offer-docx.ts.
import { findRegulatoryDoc, type LineRegulatoryStatus } from "./regulatory-check.ts";
import type { RegulatoryRecord } from "./regulatory-data";

export type CompanyInfo = {
  name: string;
  ruc: string;
  representative: string;
  role: string;
  phone: string;
  email: string;
  address: string;
  city: string;
};

export type ProcessInfo = {
  code: string;
  entity: string;
  object: string;
  date: string; // YYYY-MM-DD
  recipient: string; // a quién va dirigida la carta de presentación
  recipientRole: string;
  award: string; // resolución de adjudicación, si ya la hay
  awardDate: string;
  deliveryDays: string;
  validityDays: string;
};

export type QuoteLike = { code?: string; description: string; brand?: string; origin?: string; quantity: number; unitPrice?: number };

export type OfferLine = {
  item: number;
  code: string;
  description: string;
  brand: string;
  origin: string;
  quantity: number;
  unitPrice: number;
  supplier: string;
  regulatory: LineRegulatoryStatus | null;
};

export const DEFAULT_COMPANY: CompanyInfo = {
  name: "VOLIA S.A.S.",
  ruc: "1793206800001",
  representative: "",
  role: "Gerente General",
  phone: "098-332-3436",
  email: "voliasas@hotmail.com",
  address: "General Ulpiano Páez E2-20 y Alonso de Mercadillo, Edificio María Teresa, Local No. 2",
  city: "Quito",
};

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "2026-08-28" → "28 de agosto de 2026". Si la fecha no es válida, la devuelve tal cual. */
export function longDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "";
  return `${Number(m[3])} de ${MONTHS[Number(m[2]) - 1]} de ${m[1]}`;
}

export function buildLines(
  items: QuoteLike[],
  records: RegulatoryRecord[],
  today: string,
  guessSupplier: (description: string, brand: string) => string = (_d, brand) => brand,
  overrides: Record<number, string> = {},
): OfferLine[] {
  return items
    .filter((i) => i.description?.trim())
    .map((i, index) => {
      const item = index + 1;
      const brand = (i.brand || "").trim();
      return {
        item,
        code: (i.code || "").trim(),
        description: i.description.trim(),
        brand,
        origin: (i.origin || "").trim(),
        quantity: Number(i.quantity) || 0,
        unitPrice: Number(i.unitPrice) || 0,
        supplier: (overrides[item] ?? guessSupplier(i.description, brand) ?? "").trim(),
        regulatory: findRegulatoryDoc(i.description, records, today),
      };
    });
}

/** Líneas agrupadas por proveedor, para una carta de compromiso de compra por cada uno. Sin proveedor no hay carta. */
export function groupBySupplier(lines: OfferLine[]) {
  const map = new Map<string, OfferLine[]>();
  for (const l of lines) {
    if (!l.supplier) continue;
    map.set(l.supplier, [...(map.get(l.supplier) ?? []), l]);
  }
  return [...map.entries()].map(([supplier, list]) => ({ supplier, lines: list })).sort((a, b) => a.supplier.localeCompare(b.supplier, "es"));
}

export type ChecklistRow = { item: number; description: string; reference: string; expires: string; state: "vigente" | "por vencer" | "vencido" | "sin fecha" | "sin registro"; action: string };

/** Control interno: qué respaldo regulatorio tiene cada ítem y qué hay que hacer antes de subir la oferta. */
export function checklist(lines: OfferLine[]): ChecklistRow[] {
  return lines.map((l) => {
    const r = l.regulatory;
    if (!r) return { item: l.item, description: l.description, reference: "", expires: "", state: "sin registro", action: "Buscar el registro sanitario o la notificación y cargarlo en Vigencias." };
    const reference = r.record.reference;
    const expires = r.record.expiresAt ?? "";
    if (r.status === "sin-fecha") return { item: l.item, description: l.description, reference, expires, state: "sin fecha", action: "Confirmar la vigencia en ARCSA y registrarla en Vigencias." };
    if (r.status === "vencido") return { item: l.item, description: l.description, reference, expires, state: "vencido", action: "No ofertar con este registro: pedir la renovación o cambiar de producto." };
    if (r.status === "critico" || r.status === "proximo") return { item: l.item, description: l.description, reference, expires, state: "por vencer", action: "Vence pronto: verificar que cubra la entrega y pedir la renovación." };
    return { item: l.item, description: l.description, reference, expires, state: "vigente", action: "Adjuntar registro, ficha técnica y autorización del distribuidor." };
  });
}

export function presentationText(p: ProcessInfo, c: CompanyInfo, lines: OfferLine[]) {
  const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const paragraphs = [
    `Por medio de la presente, ${c.name}, con RUC ${c.ruc}, presenta su oferta para el procedimiento ${p.code || "[código del proceso]"}, convocado por ${p.entity || "[entidad contratante]"}, cuyo objeto es ${p.object || "[objeto de contratación]"}.`,
    `La oferta comprende ${lines.length} ítem(s), detallados en el componente de los bienes ofertados que se adjunta${total > 0 ? `, por un valor de USD ${total.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} sin IVA` : ""}. Los bienes cuentan con registro sanitario o notificación sanitaria vigente y con la autorización de sus distribuidores, cuyos documentos se adjuntan.`,
  ];
  if (p.deliveryDays) paragraphs.push(`El plazo de entrega es de ${p.deliveryDays} días contados a partir de la suscripción del contrato o de la orden de compra.`);
  if (p.validityDays) paragraphs.push(`La presente oferta tiene una validez de ${p.validityDays} días.`);
  paragraphs.push(`${c.name} declara conocer y aceptar las condiciones del pliego y se compromete a cumplirlas en su totalidad.`);
  return paragraphs;
}

/** Texto del modelo de declaración juramentada de integridad (Anexo II del SERCOP), con los datos del proceso. */
export function integrityText(p: ProcessInfo) {
  const award = p.award ? `, en el que me encuentro adjudicado mediante ${p.award}${p.awardDate ? ` de fecha ${longDate(p.awardDate)}` : ""}` : "";
  return [
    "En el registro de escrituras públicas a su cargo, sírvase autorizar una de DECLARACIÓN JURAMENTADA, acorde a las cláusulas siguientes:",
    `Declaro bajo juramento que no me encuentro inmiscuido/a en ningún acto de corrupción, ni he cometido ningún delito contra la administración pública del Estado como cohecho, concusión, enriquecimiento ilícito, tráfico de influencias, peculado, etc., así como he actuado y actuaré conforme a los principios y valores establecidos en la Política Nacional de Integridad Pública (PNIP), como lo son la integridad, la honestidad, la legalidad, la justicia, la eficiencia, la imparcialidad, la probidad, la igualdad, el acceso a la información pública, la rendición de cuentas, la prevención del conflicto de interés, la promoción de la ética o cualquier mecanismo que el Estado implementó o que implementará para fomentar la integridad pública y la lucha contra la corrupción. Es por esta razón que declaro que, de conformidad con la normativa legal y vigente, denuncié o denunciaré ante la Fiscalía General del Estado cualquier caso que llegó o llegase a mi conocimiento que pueda configurar una infracción penal y alerté o alertaré a la Secretaría General de Integridad Pública (SGIP) cualquier posible acto de corrupción que pueda interferir con la integridad, la ética y transparencia del procedimiento de contratación pública ejecutado por ${(p.entity || "[ENTIDAD CONTRATANTE]").toUpperCase()}, signado con el código ${p.code || "[CÓDIGO]"}, cuyo objeto es ${(p.object || "[OBJETO]").toUpperCase()}${award}.`,
    "Declaro que, en el presente procedimiento de contratación pública, no he ofrecido, entregado ni prometido dinero, bienes, dádivas o cualquier otro beneficio indebido a los miembros de la Comisión Técnica y/o al delegado de la fase precontractual, ni a los servidores públicos que, en el ámbito de sus competencias, hayan intervenido en la sustanciación de este procedimiento, con el propósito de obtener ventaja indebida alguna. De la misma manera, no estaré inmiscuido en actos irregulares y/o de corrupción que afecten el normal y oportuno cumplimiento y desenvolvimiento del objeto del contrato, ni que vayan contra los principios y valores de la PNIP mencionados anteriormente. Es todo cuanto puedo declarar bajo el rigor del juramento y en honor a la verdad.",
    "Cumpla usted, señor/a Notario/a, con los demás requisitos para la perfecta validez y firmeza de este instrumento.",
  ];
}

export function commitmentText(p: ProcessInfo, c: CompanyInfo, supplier: string) {
  return {
    intro: `Por medio de la presente, ${c.name}, con RUC N.° ${c.ruc}, en calidad de empresa dedicada a la comercialización y provisión de insumos y dispositivos médicos, manifiesta formalmente su compromiso de compra de los siguientes productos a ser destinados al cumplimiento del proceso N.° ${p.code || "[código]"}, de ${p.entity || "[entidad contratante]"}:`,
    after: [
      `${c.name} se compromete a adquirir los productos anteriormente detallados a ${supplier}, una vez que se produzca la firma del contrato de adjudicación por parte de la entidad contratante.`,
      "El presente documento constituye una manifestación formal de nuestra intención y compromiso comercial de adquisición de los ítems señalados, destinados al cumplimiento de las obligaciones derivadas del proceso de contratación antes mencionado.",
      `Agradecemos a ${supplier} por su colaboración y disponibilidad para garantizar el abastecimiento oportuno de los productos requeridos.`,
      "Sin otro particular, suscribimos la presente para los fines pertinentes.",
    ],
  };
}

/** Lo que falta para que el paquete salga completo (sin esto los documentos quedan con espacios en blanco). */
export function missingFields(p: ProcessInfo, c: CompanyInfo, lines: OfferLine[]) {
  const out: string[] = [];
  if (!p.code.trim()) out.push("código del proceso");
  if (!p.entity.trim()) out.push("entidad contratante");
  if (!p.object.trim()) out.push("objeto de contratación");
  if (!c.representative.trim()) out.push("representante legal");
  if (!lines.length) out.push("ítems de la cotización");
  const noSupplier = lines.filter((l) => !l.supplier).length;
  if (noSupplier) out.push(`proveedor de ${noSupplier} ítem(s)`);
  return out;
}
