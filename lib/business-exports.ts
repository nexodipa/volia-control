"use client";

import { VOLIA_LOGO_DATA_URL } from "./volia-logo";

export type ExportCell = string | number | null | undefined;
export type ExportTable = { title?: string; headers: string[]; rows: ExportCell[][] };
export type BusinessExport = {
  title: string;
  subtitle?: string;
  reference?: string;
  metadata?: Array<[string, ExportCell]>;
  paragraphs?: string[];
  afterword?: string[];
  tables?: ExportTable[];
  summary?: Array<[string, ExportCell]>;
  disclaimer?: string;
};

export const safeName = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "volia-control";
const text = (value: ExportCell) => value === null || value === undefined || value === "" ? "—" : String(value);

async function getLogoDataUrl() {
  return VOLIA_LOGO_DATA_URL;
}

export async function getLogoBytes() {
  const binary = atob(VOLIA_LOGO_DATA_URL.split(",")[1]);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function exportBusinessPdf(payload: BusinessExport, filename = payload.title) {
  const [{ default: jsPDF }, autoTableModule] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = autoTableModule.autoTable;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const logo = await getLogoDataUrl();
  doc.addImage(logo, "JPEG", 15, 10, 38, 18);
  doc.setTextColor(14, 80, 105); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text(payload.title, 195, 16, { align: "right" });
  doc.setTextColor(92, 112, 116); doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  if (payload.subtitle) doc.text(payload.subtitle, 195, 22, { align: "right", maxWidth: 120 });
  if (payload.reference) doc.text(payload.reference, 195, 28, { align: "right" });
  doc.setDrawColor(14, 120, 154); doc.setLineWidth(.6); doc.line(15, 35, 195, 35);
  let y = 42;
  if (payload.metadata?.length) {
    autoTable(doc, { startY: y, theme: "plain", margin: { left: 15, right: 15 }, tableWidth: "auto", body: payload.metadata.map(([label, value]) => [label, text(value)]), styles: { fontSize: 8, cellPadding: 1.7, textColor: [38, 60, 63] }, columnStyles: { 0: { fontStyle: "bold", textColor: [14, 98, 120], cellWidth: 43 } } });
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 6;
  }
  for (const paragraph of payload.paragraphs ?? []) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(43, 57, 60);
    const lines = doc.splitTextToSize(paragraph, 180); if (y + lines.length * 4.5 > 275) { doc.addPage(); y = 18; }
    doc.text(lines, 15, y); y += lines.length * 4.5 + 3;
  }
  for (const table of payload.tables ?? []) {
    if (table.title) { if (y > 260) { doc.addPage(); y = 18; } doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(14, 80, 105); doc.text(table.title, 15, y); y += 3; }
    autoTable(doc, { startY: y, head: [table.headers], body: table.rows.map((row) => row.map(text)), margin: { left: 15, right: 15 }, theme: "grid", styles: { fontSize: 7.4, cellPadding: 2.2, lineColor: [215, 226, 228], lineWidth: .2 }, headStyles: { fillColor: [14, 80, 105], textColor: 255, fontStyle: "bold" }, alternateRowStyles: { fillColor: [245, 249, 249] } });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 7;
  }
  if (payload.summary?.length) {
    if (y > 245) { doc.addPage(); y = 18; }
    autoTable(doc, { startY: y, margin: { left: 105, right: 15 }, body: payload.summary.map(([label, value]) => [label, text(value)]), theme: "grid", styles: { fontSize: 8, cellPadding: 2.4, lineColor: [210, 223, 225] }, columnStyles: { 0: { fontStyle: "bold", fillColor: [238, 245, 245] }, 1: { halign: "right", fontStyle: "bold" } } });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 7;
  }
  for (const paragraph of payload.afterword ?? []) {
    if (y > 270) { doc.addPage(); y = 18; }
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(43, 57, 60);
    const lines = doc.splitTextToSize(paragraph, 180);
    doc.text(lines, 15, y); y += lines.length * 4 + 2;
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) { doc.setPage(page); doc.setDrawColor(214, 225, 227); doc.line(15, 282, 195, 282); doc.setFontSize(7); doc.setTextColor(110, 126, 129); doc.text(payload.disclaimer || "Documento institucional de VOLIA S.A.S. Revisión humana obligatoria antes de su emisión.", 15, 287, { maxWidth: 150 }); doc.text(`Página ${page} de ${pages}`, 195, 287, { align: "right" }); }
  doc.save(`${safeName(filename)}.pdf`);
}

export async function exportBusinessWord(payload: BusinessExport, filename = payload.title) {
  const { AlignmentType, BorderStyle, Document, Footer, ImageRun, Packer, PageNumber, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = await import("docx");
  const cell = (value: ExportCell, bold = false) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: text(value), bold, size: 18 })] })], margins: { top: 90, bottom: 90, left: 110, right: 110 } });
  const logo = await getLogoBytes();
  const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [
    new Paragraph({ alignment: AlignmentType.LEFT, children: [new ImageRun({ data: logo, transformation: { width: 150, height: 72 }, type: "jpg" })] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { before: 80, after: 80 }, children: [new TextRun({ text: payload.title, bold: true, color: "0E5069", size: 30 })] }),
  ];
  if (payload.subtitle) children.push(new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 160 }, children: [new TextRun({ text: payload.subtitle, color: "5C7074", size: 18 })] }));
  if (payload.reference) children.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: payload.reference, bold: true, color: "0E789A", size: 18 })] }));
  if (payload.metadata?.length) children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: payload.metadata.map(([label, value]) => new TableRow({ children: [cell(label, true), cell(value)] })), borders: { top: { style: BorderStyle.SINGLE, color: "D7E2E4", size: 1 }, bottom: { style: BorderStyle.SINGLE, color: "D7E2E4", size: 1 }, left: { style: BorderStyle.SINGLE, color: "D7E2E4", size: 1 }, right: { style: BorderStyle.SINGLE, color: "D7E2E4", size: 1 }, insideHorizontal: { style: BorderStyle.SINGLE, color: "E4ECEE", size: 1 }, insideVertical: { style: BorderStyle.SINGLE, color: "E4ECEE", size: 1 } } }));
  for (const paragraph of payload.paragraphs ?? []) children.push(new Paragraph({ spacing: { before: 160, after: 100 }, children: [new TextRun({ text: paragraph, size: 20 })] }));
  for (const table of payload.tables ?? []) {
    if (table.title) children.push(new Paragraph({ spacing: { before: 220, after: 80 }, children: [new TextRun({ text: table.title, bold: true, color: "0E5069", size: 22 })] }));
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, children: table.headers.map((header) => cell(header, true)) }), ...table.rows.map((row) => new TableRow({ children: row.map((value) => cell(value)) }))] }));
  }
  if (payload.summary?.length) { children.push(new Paragraph({ spacing: { before: 220 }, children: [new TextRun({ text: "Resumen", bold: true, color: "0E5069", size: 22 })] })); children.push(new Table({ width: { size: 55, type: WidthType.PERCENTAGE }, alignment: AlignmentType.RIGHT, rows: payload.summary.map(([label, value]) => new TableRow({ children: [cell(label, true), cell(value, true)] })) })); }
  for (const paragraph of payload.afterword ?? []) children.push(new Paragraph({ spacing: { before: 160, after: 100 }, children: [new TextRun({ text: paragraph, size: 20 })] }));
  const wordDocument = new Document({ sections: [{ properties: { page: { margin: { top: 800, right: 800, bottom: 800, left: 800 } } }, children, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: payload.disclaimer || "Documento institucional de VOLIA S.A.S. · ", color: "6E7E81", size: 15 }), new TextRun({ children: [PageNumber.CURRENT], size: 15 })] })] }) } }] });
  const blob = await Packer.toBlob(wordDocument); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `${safeName(filename)}.docx`; link.click(); URL.revokeObjectURL(url);
}
