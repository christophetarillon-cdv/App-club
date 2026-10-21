import type { PDFFont } from 'pdf-lib';
import { PDF_TITLE, type PaymentMethod } from './payment-constants';

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

export interface DepositLine {
  memberName: string;
  amount: number;
  expectedDate?: string;
  chequeNumber?: string;
  draweeBank?: string;
  draweeCity?: string;
  chequePayerName?: string;
  transferRef?: string;
  transferDate?: string;
  cashReceiptRef?: string;
  cmc7?: string;
}

export interface DepositAccount {
  holder?: string;
  name?: string;
  bank?: string;
  accountNumber?: string;
  label?: string;
}

const fr = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR');

export function buildDepositBordereauPdf(p: {
  method: PaymentMethod;
  depositDate: string;
  depositLabel?: string;
  account: DepositAccount;
  lines: DepositLine[];
  totalCents: number;
}): Promise<Uint8Array> {
  const { method, lines } = p;
  const columns: BordereauColumn[] = method === 'cheque'
    ? [
        { label: 'Nom Prénom', x: 50, width: 175 },
        { label: 'Banque / Ville', x: 232, width: 125 },
        { label: 'N° chèque', x: 362, width: 90, bold: true },
        { label: 'Montant', x: 460, width: 85 },
      ]
    : method === 'transfer'
      ? [
          { label: 'Nom Prénom', x: 50, width: 200 },
          { label: 'Référence', x: 260, width: 120 },
          { label: 'Date', x: 390, width: 60 },
          { label: 'Montant', x: 460, width: 85 },
        ]
      : [
          { label: 'Nom Prénom', x: 50, width: 250 },
          { label: method === 'helloasso' ? 'Date paiement' : 'N° reçu', x: 310, width: 140 },
          { label: 'Montant', x: 460, width: 85 },
        ];

  const rows: BordereauRow[] = lines.map(line => {
    const amount = `${(line.amount / 100).toFixed(2)} €`;
    if (method === 'cheque') {
      return {
        cells: [line.memberName, [line.draweeBank, line.draweeCity].filter(Boolean).join(' / '), line.chequeNumber ?? '', amount],
        note: line.chequePayerName ? `Chèque au nom de ${line.chequePayerName}` : undefined,
      };
    }
    if (method === 'transfer') {
      return { cells: [line.memberName, line.transferRef ?? '', line.transferDate ? fr(line.transferDate) : '', amount] };
    }
    if (method === 'helloasso') {
      return { cells: [line.memberName, line.expectedDate ? fr(line.expectedDate) : '—', amount] };
    }
    return { cells: [line.memberName, line.cashReceiptRef ?? '', amount] };
  });

  const countLabel = method === 'cheque'
    ? `${lines.length} chèque${lines.length > 1 ? 's' : ''}`
    : `${lines.length} règlement${lines.length > 1 ? 's' : ''}`;

  const dateFr = new Date(p.depositDate + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const a = p.account;
  const info: BordereauInfoLine[] = [];
  if (a.holder) {
    info.push({ text: 'Compte bénéficiaire', size: 9, bold: true, muted: true, gap: 14 });
    info.push({ text: a.holder, size: 11, bold: true, gap: 14 });
  }
  const bankLine = [a.name, a.bank].filter(Boolean).join(' — ');
  if (bankLine) info.push({ text: bankLine, gap: 14 });
  if (a.accountNumber) info.push({ text: `N° compte : ${a.accountNumber}`, gap: a.label ? 12 : 20 });
  if (a.label) info.push({ text: a.label, size: 9, muted: true, gap: 20 });
  info.push({ text: `Date : ${dateFr}`, size: 11, right: p.depositLabel || undefined, gap: 25 });

  return buildBordereauPdf({
    title: PDF_TITLE[method],
    info,
    columns,
    rows,
    totals: { left: countLabel, right: `Total : ${(p.totalCents / 100).toFixed(2)} €` },
  });
}
