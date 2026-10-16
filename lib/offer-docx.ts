// Genera en Word (.docx) los documentos del paquete de oferta. Cada documento empieza en página nueva,
// con el membrete de Volia, para revisar, firmar y subir al portal. Solo se usa en el navegador.
import { getLogoBytes, safeName } from "./business-exports";
import {
  checklist, commitmentText, groupBySupplier, integrityText, longDate, presentationText,
  type CompanyInfo, type OfferLine, type ProcessInfo,
} from "./offer-package";

export type OfferDocKind = "presentacion" | "integridad" | "compromisos" | "componente" | "control";

export const OFFER_DOCS: Record<OfferDocKind, string> = {
  presentacion: "Carta de presentación de la oferta",
  integridad: "Declaración juramentada de integridad (Anexo II)",
  compromisos: "Cartas de compromiso de compra",
  componente: "Componente de los bienes ofertados",
  control: "Control de respaldos (uso interno)",
};

export async function exportOfferPackage(kinds: OfferDocKind[], p: ProcessInfo, c: CompanyInfo, lines: OfferLine[]) {
  const d = await import("docx");
  const { AlignmentType, Document, Footer, ImageRun, Packer, PageBreak, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, ShadingType } = d;
  const logo = await getLogoBytes();
  const size = 21;
  const para = (text: string, opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; before?: number; sz?: number; color?: string } = {}) =>
    new Paragraph({ alignment: opts.align ?? AlignmentType.JUSTIFIED, spacing: { before: opts.before ?? 0, after: opts.after ?? 140, line: 300 }, children: [new TextRun({ text, bold: opts.bold, size: opts.sz ?? size, color: opts.color })] });
  const cell = (text: string, head = false, width?: number) => new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    shading: head ? { type: ShadingType.CLEAR, color: "auto", fill: "0D5C4E" } : undefined,
    margins: { top: 70, bottom: 70, left: 90, right: 90 },
    children: [new Paragraph({ children: [new TextRun({ text: text || "—", bold: head, size: 17, color: head ? "FFFFFF" : undefined })] })],
  });
  const table = (headers: string[], rows: string[][], widths: number[]) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, true, widths[i])) }), ...rows.map((r) => new TableRow({ children: r.map((v, i) => cell(v, false, widths[i])) }))],
  });
  const header = () => [
    new Paragraph({ children: [new ImageRun({ data: logo, transformation: { width: 130, height: 62 }, type: "jpg" })] }),
    para(`${c.city}, ${longDate(p.date)}`, { align: AlignmentType.RIGHT, before: 120, after: 240 }),
  ];
  const signature = () => [
    para("Atentamente,", { before: 240, after: 900, align: AlignmentType.LEFT }),
    para(c.representative ? c.representative.toUpperCase() : "[REPRESENTANTE LEGAL]", { bold: true, after: 0, align: AlignmentType.LEFT }),
    para((c.role || "Representante legal").toUpperCase(), { after: 0, align: AlignmentType.LEFT }),
    para(c.name, { after: 120, align: AlignmentType.LEFT }),
    para(`RUC: ${c.ruc} · Tel.: ${c.phone} · Correo: ${c.email}`, { sz: 17, color: "5B6F6B", after: 0, align: AlignmentType.LEFT }),
    para(`Dirección: ${c.address}`, { sz: 17, color: "5B6F6B", align: AlignmentType.LEFT }),
  ];
  const addressee = (lines2: string[]) => lines2.filter(Boolean).map((t, i) => para(t, { bold: i === 0, after: 0, align: AlignmentType.LEFT })).concat([para("Presente.-", { after: 200, align: AlignmentType.LEFT })]);
  const money = (n: number) => n ? n.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : "";

  const sections: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>>[] = [];

  if (kinds.includes("presentacion")) {
    sections.push([
      ...header(),
      ...addressee([p.recipient || "Señores", p.recipientRole, p.entity]),
      para(`Asunto: Presentación de oferta – Proceso ${p.code}`, { bold: true, align: AlignmentType.LEFT }),
      para("De nuestra consideración:", { align: AlignmentType.LEFT }),
      ...presentationText(p, c, lines).map((t) => para(t)),
      ...signature(),
    ]);
  }
  if (kinds.includes("integridad")) {
    sections.push([
      para("ANEXO II", { bold: true, align: AlignmentType.CENTER, after: 60 }),
      para("MODELO DE DECLARACIÓN JURAMENTADA DE INTEGRIDAD DEL PROVEEDOR", { bold: true, align: AlignmentType.CENTER, after: 280 }),
      para("SEÑOR/A NOTARIO/A", { bold: true, align: AlignmentType.LEFT }),
      ...integrityText(p).map((t) => para(t)),
      para(`${c.city}, ${longDate(p.date)}`, { before: 200, align: AlignmentType.LEFT }),
      ...signature(),
    ]);
  }
  if (kinds.includes("compromisos")) {
    for (const g of groupBySupplier(lines)) {
      const t = commitmentText(p, c, g.supplier);
      sections.push([
        ...header(),
        para("CARTA DE COMPROMISO DE COMPRA", { bold: true, align: AlignmentType.CENTER, after: 200 }),
        ...addressee(["Señores", g.supplier]),
        para(`Asunto: Carta de compromiso de compra – Proceso ${p.code}`, { bold: true, align: AlignmentType.LEFT }),
        para("De nuestra consideración:", { align: AlignmentType.LEFT }),
        para(t.intro),
        table(["Ítem", "Descripción", "Cantidad"], g.lines.map((l) => [String(l.item), l.description, l.quantity.toLocaleString("es-EC")]), [10, 70, 20]),
        ...t.after.map((x, i) => para(x, { before: i === 0 ? 200 : 0 })),
        ...signature(),
      ]);
    }
  }
  if (kinds.includes("componente")) {
    sections.push([
      ...header(),
      para("COMPONENTE DE LOS BIENES OFERTADOS", { bold: true, align: AlignmentType.CENTER, after: 80 }),
      para(`Proceso ${p.code} · ${p.entity}`, { align: AlignmentType.CENTER, after: 60 }),
      para(p.object, { align: AlignmentType.CENTER, after: 240, sz: 18, color: "5B6F6B" }),
      table(
        ["Ítem", "Descripción del bien ofertado", "Cantidad", "Marca", "Procedencia", "Registro sanitario", "Precio unitario (USD)"],
        lines.map((l) => [String(l.item), l.description, l.quantity.toLocaleString("es-EC"), l.brand, l.origin, l.regulatory?.record.reference ?? "", money(l.unitPrice)]),
        [6, 36, 9, 12, 11, 14, 12],
      ),
      ...signature(),
    ]);
  }
  if (kinds.includes("control")) {
    const rows = checklist(lines);
    const count = (s: string) => rows.filter((r) => r.state === s).length;
    sections.push([
      para("CONTROL DE RESPALDOS DE LA OFERTA", { bold: true, align: AlignmentType.LEFT, after: 60 }),
      para(`Uso interno de ${c.name}: no se presenta a la entidad. Proceso ${p.code}.`, { sz: 18, color: "5B6F6B", align: AlignmentType.LEFT }),
      para(`${count("vigente")} ítem(s) con registro vigente · ${count("por vencer")} por vencer · ${count("vencido")} vencido(s) · ${count("sin fecha")} sin fecha · ${count("sin registro")} sin registro identificado. El registro de cada línea es una propuesta del sistema: confirmarlo contra el PDF antes de subir la oferta.`, { align: AlignmentType.LEFT }),
      table(["Ítem", "Descripción", "Proveedor", "Registro", "Vence", "Estado", "Qué hacer"],
        rows.map((r) => [String(r.item), r.description, lines.find((l) => l.item === r.item)?.supplier ?? "", r.reference, r.expires, r.state, r.action]),
        [6, 26, 14, 13, 10, 10, 21]),
    ]);
  }

  const children = sections.flatMap((s, i) => (i === 0 ? s : [new Paragraph({ children: [new PageBreak()] }), ...s]));
  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 900, right: 1000, bottom: 900, left: 1100 } } },
      children,
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${c.name} · RUC ${c.ruc} · ${c.address}`, size: 15, color: "6E7E81" })] })] }) },
    }],
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const label = kinds.length === 1 ? OFFER_DOCS[kinds[0]] : "Paquete de oferta";
  link.href = url;
  link.download = `${safeName(`${label} ${p.code || ""}`)}.docx`;
  link.click();
  URL.revokeObjectURL(url);
  return sections.length;
}
