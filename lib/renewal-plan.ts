// Plan de renovación de documentos regulatorios: cuándo conviene empezar a gestionarlos, a quién pedírselos y el
// borrador del correo. Funciones puras (sin red ni base de datos) para poder probarlas.
//
// Los plazos de gestión son internos de Volia, no plazos legales: el titular o el fabricante es quien renueva el
// documento y suele tardar semanas. Se pueden ajustar en LEAD_DAYS.
import { daysUntil } from "./business-alerts.ts";

export type RenewalDoc = { reference: string; kind: string; subject: string; items?: string; expiresAt: string | null };
export type RenewalKind = "registro" | "notificacion" | "iso" | "autorizacion" | "otro";

/** Días antes del vencimiento en que se debe empezar a pedir el documento renovado. */
export const LEAD_DAYS: Record<RenewalKind, number> = { registro: 180, notificacion: 150, iso: 120, autorizacion: 60, otro: 90 };

/** A partir de estos días de anticipación el resumen ya avisa por su cuenta (sección «por vencer»). */
export const EARLY_FROM_DAYS = 90;

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function renewalKind(kind: string): RenewalKind {
  const k = plain(kind).replace(/_/g, " ");
  if (k.includes("registro")) return "registro";
  if (k.includes("notificacion")) return "notificacion";
  if (/\biso\b/.test(k)) return "iso";
  if (k.includes("autorizacion")) return "autorizacion";
  return "otro";
}

const KIND_TEXT: Record<RenewalKind, string> = { registro: "registro sanitario", notificacion: "notificación sanitaria", iso: "certificado ISO", autorizacion: "autorización de distribución", otro: "documento regulatorio" };

/** Quién renueva el documento: el nombre entre paréntesis del producto («… (Prodimeda)») o el emisor de la autorización. */
export function holderOf(doc: Pick<RenewalDoc, "reference" | "kind" | "subject">): string {
  if (renewalKind(doc.kind) === "autorizacion") {
    const from = /^(.*?)\s+a\s+Volia\b/i.exec(doc.reference);
    if (from?.[1].trim()) return from[1].trim();
    return doc.reference.split(",")[0].trim();
  }
  const paren = /\(([^)]+)\)\s*$/.exec(doc.subject.trim());
  return paren ? paren[1].split(",")[0].trim() : "";
}

export type RenewalStage = "vencido" | "urgente" | "iniciar";
export type RenewalItem<T extends RenewalDoc = RenewalDoc> = { doc: T & { expiresAt: string }; days: number; kind: RenewalKind; holder: string; lead: number; stage: RenewalStage };

/** Documentos dentro de su plazo de gestión (o ya vencidos), del más urgente al menos urgente. Sin fecha no entran. */
export function renewalsDue<T extends RenewalDoc>(docs: T[], today: string): RenewalItem<T>[] {
  const out: RenewalItem<T>[] = [];
  for (const doc of docs) {
    if (!doc.expiresAt) continue;
    const kind = renewalKind(doc.kind);
    const days = daysUntil(doc.expiresAt, today);
    const lead = LEAD_DAYS[kind];
    if (days > lead) continue;
    out.push({ doc: { ...doc, expiresAt: doc.expiresAt }, days, kind, holder: holderOf(doc), lead, stage: days < 0 ? "vencido" : days <= 30 ? "urgente" : "iniciar" });
  }
  return out.sort((a, b) => a.days - b.days);
}

/** Los que ya entraron en plazo de gestión pero todavía no los cubre la sección «por vencer» (más de 90 días). */
export function earlyRenewals<T extends RenewalDoc>(docs: T[], today: string, full: boolean): RenewalItem<T>[] {
  return renewalsDue(docs, today).filter((r) => r.days > EARLY_FROM_DAYS && (full || [r.lead, 120, 100].includes(r.days)));
}

export const renewalLine = (r: RenewalItem<RenewalDoc>) => `${r.doc.reference} (${KIND_TEXT[r.kind]}) · ${r.doc.subject || "sin descripción"} · vence el ${r.doc.expiresAt} (en ${r.days} día(s))${r.holder ? ` · pedir a ${r.holder}` : ""}`;

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const longDate = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso); return m ? `${Number(m[3])} de ${MONTHS[Number(m[2]) - 1]} del ${m[1]}` : iso; };
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const ASK: Record<RenewalKind, string[]> = {
  registro: ["la constancia del estado de su renovación (reinscripción) ante ARCSA y, cuando esté lista, la copia del registro sanitario vigente;", "la carta de autorización de distribución actualizada a nombre de Volia S.A.S."],
  notificacion: ["la constancia del estado de la renovación de la notificación sanitaria y, cuando esté lista, la copia vigente;", "la carta de autorización de distribución actualizada a nombre de Volia S.A.S."],
  iso: ["la copia del certificado renovado, con su alcance y fecha de vigencia."],
  autorizacion: ["una nueva carta de autorización de distribución a nombre de Volia S.A.S. Si es para un proceso de contratación específico, les indicaremos su código."],
  otro: ["la copia vigente del documento o la constancia de su renovación."],
};

export type RenewalDraft = { holder: string; subject: string; body: string };

/** Borrador del correo para pedir la renovación. Nunca se envía solo: la persona lo revisa y lo manda desde su correo. */
export function renewalDraft(doc: RenewalDoc & { expiresAt: string }, today: string): RenewalDraft {
  const kind = renewalKind(doc.kind);
  const holder = holderOf(doc);
  const days = daysUntil(doc.expiresAt, today);
  const what = kind === "iso" && /^iso\b/i.test(doc.reference) ? `certificado ${doc.reference}` : `${KIND_TEXT[kind]} ${doc.reference}`;
  const state = days < 0 ? `venció el ${longDate(doc.expiresAt)}` : days === 0 ? "vence hoy" : `vence el ${longDate(doc.expiresAt)}`;
  const reply = days < 0 || days <= 14 ? "a la brevedad posible" : `hasta el ${longDate(addDays(today, 7))}`;
  const items = doc.items && !/^varios$/i.test(doc.items.trim()) ? `\nRespalda los ítems ${doc.items.trim()} de nuestros informes de necesidad.` : "";
  const lines = [
    `Estimados señores${holder ? ` de ${holder}` : " [titular del documento]"}:`,
    "",
    `Les escribimos de Volia S.A.S. por el ${what}${doc.subject ? ` (${doc.subject})` : ""}, que ${state}.${items}`,
    "",
    "Para no interrumpir nuestra participación en procesos de contratación pública, les agradecemos enviarnos:",
    ...ASK[kind].map((l, i) => `${i + 1}. ${l.charAt(0).toUpperCase()}${l.slice(1)}`),
    "",
    `Quedamos atentos a su respuesta ${reply}.`,
    "",
    "Atentamente,",
    "Volia S.A.S.",
  ];
  return { holder, subject: `${days < 0 ? "Documento vencido" : "Renovación"}: ${what}`, body: lines.join("\n") };
}
