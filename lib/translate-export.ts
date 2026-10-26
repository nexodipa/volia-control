// Descarga de la traducción en Word y PDF. Solo se usa en el navegador.
import { safeName } from "./business-exports";
import type { TranslatedPage } from "./translate";

const NOTE = "Traducción automática del inglés al español. Debe ser revisada por una persona antes de usarse o enviarse.";

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = filename; link.click();
  URL.revokeObjectURL(url);
}

export async function exportTranslationWord(pages: TranslatedPage[], sourceName: string) {
  const { AlignmentType, Document, Footer, Packer, PageBreak, Paragraph, TextRun } = await import("docx");
  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: "Traducción al español", bold: true, size: 36, color: "14392C" })] }),
    new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: `Documento original: ${sourceName}`, size: 20, color: "5F716D" })] }),
  ];
  pages.forEach((p, i) => {
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(new Paragraph({ spacing: { before: 120, after: 160 }, children: [new TextRun({ text: `Página ${p.page}`, bold: true, size: 22, color: "14392C" })] }));
    for (const block of p.translated.split(/\n{2,}/)) {
      const text = block.replace(/\n/g, " ").trim();
      if (text) children.push(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 140, line: 300 }, children: [new TextRun({ text, size: 22 })] }));
    }
  });
  const doc = new Document({
    sections: [{ children, footers: { default: new Footer({ children: [new Paragraph({ children: [new TextRun({ text: NOTE, size: 16, color: "5F716D" })] })] }) } }],
  });
  save(await Packer.toBlob(doc), `${safeName(sourceName.replace(/\.[a-z0-9]+$/i, ""))}-es.docx`);
}

export async function exportTranslationPdf(pages: TranslatedPage[], sourceName: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 18, LINE = 5.6;
  let y = M;
  const foot = (n: number) => { doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(95, 113, 109); doc.text(NOTE, M, H - 9); doc.text(String(n), W - M, H - 9, { align: "right" }); };
  let pageNo = 1;
  const ensure = (need: number) => { if (y + need > H - 18) { foot(pageNo); doc.addPage(); pageNo += 1; y = M; } };
  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(20, 57, 44); doc.text("Traducción al español", M, y); y += 8;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(95, 113, 109); doc.text(`Documento original: ${sourceName}`, M, y); y += 10;
  for (const p of pages) {
    ensure(20);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20, 57, 44); doc.text(`Página ${p.page}`, M, y); y += 7;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(23, 37, 31);
    for (const block of p.translated.split("\n")) {
      if (!block.trim()) { y += 3; continue; }
      for (const row of doc.splitTextToSize(block, W - 2 * M) as string[]) { ensure(LINE); doc.text(row, M, y); y += LINE; }
    }
    y += 6;
  }
  foot(pageNo);
  save(doc.output("blob"), `${safeName(sourceName.replace(/\.[a-z0-9]+$/i, ""))}-es.pdf`);
}
