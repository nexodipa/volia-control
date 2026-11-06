// Word de la carta de autorización de marca. Lleva el membrete de quien la firma (el fabricante o su
// representante), no el de Volia, y deja el espacio de la firma en blanco: la firma es de esa persona.
import { getLogoBytes, safeName } from "./business-exports";
import { authorizationLetter, letterDate, type AuthorizationInput } from "./doc-templates";

export type Letterhead = { name: string; address: string; phone: string; email: string; /** Con el logo de Volia en el encabezado, en lugar del nombre del emisor en texto. */ voliaLogo?: boolean };

export async function exportAuthorizationLetter(input: AuthorizationInput, head: Letterhead) {
  const { AlignmentType, Document, Footer, Header, ImageRun, Packer, Paragraph, TextRun, BorderStyle } = await import("docx");
  const logo = head.voliaLogo ? await getLogoBytes() : null;
  const letter = authorizationLetter(input);
  const size = 22;
  const p = (text: string, o: { bold?: boolean; after?: number; before?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
    new Paragraph({ alignment: o.align ?? AlignmentType.JUSTIFIED, spacing: { before: o.before ?? 0, after: o.after ?? 160, line: 320 }, children: [new TextRun({ text, bold: o.bold, size })] });
  const children = [
    p(`${input.city || "Quito"}, ${letterDate(input.date)}`, { align: AlignmentType.LEFT, after: 300, before: 600 }),
    ...letter.salutation.map((t, i) => p(t, { align: AlignmentType.LEFT, after: i === 0 || i === 1 ? 0 : 240, bold: i === 1 })),
    p(letter.intro, { after: 240 }),
    ...letter.bullets.map((b) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 80, line: 320 }, children: [new TextRun({ text: b, size, bold: false })] })),
    ...letter.closing.map((t, i) => p(t, { before: i === 0 ? 300 : 0 })),
    p(letter.signoff[0], { align: AlignmentType.LEFT, before: 240, after: 1100 }),
    p(letter.signoff[1], { align: AlignmentType.LEFT, after: 0 }),
    p(letter.signoff[2], { align: AlignmentType.LEFT }),
  ];
  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1500, right: 1500, bottom: 1300, left: 1500 } } },
      headers: { default: new Header({ children: [new Paragraph({ children: logo ? [new ImageRun({ data: logo, transformation: { width: 150, height: 72 }, type: "jpg" })] : [new TextRun({ text: head.name || "[Membrete del emisor]", bold: true, size: 30, color: "1F4E79" })] })] }) },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({ alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 6, color: "5B9BD5", space: 6 } }, children: [new TextRun({ text: head.address ? `Dirección: ${head.address}` : "", size: 17, color: "2E74B5" })] }),
            new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: [head.phone && `Telf: ${head.phone}`, head.email && `Email: ${head.email}`].filter(Boolean).join("  .  "), size: 17, color: "2E74B5" })] }),
          ],
        }),
      },
      children,
    }],
  });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName(`Carta de autorizacion ${input.process || ""}`)}.docx`;
  link.click();
  URL.revokeObjectURL(url);
}
