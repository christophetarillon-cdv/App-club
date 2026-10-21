import type { PDFFont } from 'pdf-lib';

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN_X = 50;
const RIGHT = 545;
const TOP = PAGE_H - 50;
const BOTTOM = 60;
const ROW_H = 18;
const NOTE_H = 10;

type Color = [number, number, number];
const INK: Color = [0.1, 0.1, 0.1];
const SOFT: Color = [0.3, 0.3, 0.3];
const MUTED: Color = [0.5, 0.5, 0.5];
const RULE: Color = [0.7, 0.7, 0.7];

export interface BordereauInfoLine {
  text: string;
  size?: number;
  bold?: boolean;
  muted?: boolean;
  right?: string;
  gap?: number;
}

export interface BordereauColumn {
  label: string;
  x: number;
  width: number;
  size?: number;
  bold?: boolean;
}

export interface BordereauRow {
  cells: string[];
  note?: string;
}

export interface BordereauSpec {
  title: string;
  info: BordereauInfoLine[];
  columns: BordereauColumn[];
  rows: BordereauRow[];
  totals: { left: string; right: string };
}

function fit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 0 && font.widthOfTextAtSize(cut + '…', size) > maxWidth) cut = cut.slice(0, -1);
  return cut + '…';
}

export async function buildBordereauPdf(spec: BordereauSpec): Promise<Uint8Array> {
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const color = (c: Color) => rgb(c[0], c[1], c[2]);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = TOP;

  const drawTableHeader = () => {
    for (const col of spec.columns) {
      page.drawText(col.label, { x: col.x, y, size: 10, font: fontBold, color: color(INK) });
    }
    y -= 5;
    page.drawLine({ start: { x: MARGIN_X, y }, end: { x: RIGHT, y }, thickness: 0.5, color: color(RULE) });
    y -= 16;
  };

  const newPage = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = TOP;
    drawTableHeader();
  };

  page.drawText(spec.title, { x: MARGIN_X, y, size: 16, font: fontBold, color: color(INK) });
  y -= 35;

  for (const line of spec.info) {
    const size = line.size ?? 10;
    const f = line.bold ? fontBold : font;
    const c = line.muted ? MUTED : SOFT;
    page.drawText(line.text, { x: MARGIN_X, y, size, font: f, color: color(c) });
    if (line.right) {
      const w = font.widthOfTextAtSize(line.right, size);
      page.drawText(line.right, { x: RIGHT - w, y, size, font, color: color(SOFT) });
    }
    y -= line.gap ?? 14;
  }

  y -= 6;
  page.drawLine({ start: { x: MARGIN_X, y }, end: { x: RIGHT, y }, thickness: 0.5, color: color(RULE) });
  y -= 18;
  drawTableHeader();

  for (const row of spec.rows) {
    const needed = row.note ? ROW_H + NOTE_H : ROW_H;
    if (y - needed < BOTTOM) newPage();

    spec.columns.forEach((col, i) => {
      const size = col.size ?? 10;
      const f = col.bold ? fontBold : font;
      const text = fit(row.cells[i] ?? '', f, size, col.width - 6);
      if (text) page.drawText(text, { x: col.x, y, size, font: f, color: color(INK) });
    });

    if (row.note) {
      page.drawText(fit(row.note, font, 8, RIGHT - MARGIN_X), { x: MARGIN_X, y: y - 11, size: 8, font, color: color(MUTED) });
      y -= ROW_H + NOTE_H;
    } else {
      y -= ROW_H;
    }
  }

  if (y - 50 < BOTTOM) newPage();
  y -= 8;
  page.drawLine({ start: { x: MARGIN_X, y }, end: { x: RIGHT, y }, thickness: 0.5, color: color(RULE) });
  y -= 18;
  page.drawText(spec.totals.left, { x: MARGIN_X, y, size: 11, font: fontBold, color: color(INK) });
  const rightW = fontBold.widthOfTextAtSize(spec.totals.right, 11);
  page.drawText(spec.totals.right, { x: RIGHT - rightW, y, size: 11, font: fontBold, color: color(INK) });

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const label = `Page ${i + 1} / ${pages.length}`;
    const w = font.widthOfTextAtSize(label, 8);
    p.drawText(label, { x: RIGHT - w, y: 30, size: 8, font, color: color(MUTED) });
  });

  return pdf.save();
}
