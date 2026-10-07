/**
 * Invoice PDF generator with ZERO dependencies.
 *
 * Why this exists: the browser print dialog (window.print) is unreliable on phones and inside embedded
 * frames. This draws the same Tally-style invoice straight into a real PDF file, which can then be
 * downloaded, opened, printed from the PDF viewer, or shared to WhatsApp.
 *
 * Uses the built-in PDF fonts (Helvetica). They only contain English letters and digits, so the rupee
 * sign is written as "Rs." and other scripts (Hindi / Gujarati) fall back to "?" - use the Print button
 * for those.
 */

import { HELV_REGULAR, HELV_BOLD } from './pdfFontMetrics';
import { fmtMoney, DEFAULT_DECLARATION } from './invoiceModel';
import type { InvoiceModel, InvoiceOptions } from './invoiceModel';

export interface InvoicePdfExtras {
  businessName: string;
  declaration?: string;
  jurisdiction: string;
  bank?: { holder: string; bankName: string; accountNo: string; branch: string; ifsc: string } | null;
  upiId?: string;
  /** QR code modules; data is row-major, non-zero = dark module */
  qr?: { size: number; data: ArrayLike<number> } | null;
}

type Font = 'R' | 'B' | 'I' | 'BI';

function sanitize(input: string): string {
  let s = String(input ?? '');
  s = s
    .replace(/\u20B9/g, 'Rs.')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\u2022/g, '*')
    .replace(/\u00A0/g, ' ')
    .replace(/[\r\n\t]+/g, ' ');
  try {
    s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  } catch {
    /* ignore */
  }
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c >= 32 && c <= 126 ? s[i] : '?';
  }
  return out;
}

function widthOf(s: string, size: number, bold: boolean): number {
  const table = bold ? HELV_BOLD : HELV_REGULAR;
  let w = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    w += c >= 32 && c <= 126 ? table[c - 32] : 556;
  }
  return (w * size) / 1000;
}

function pdfEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

class PdfBuilder {
  W: number;
  H: number;
  pages: string[] = [];
  cur = '';

  constructor(W: number, H: number) {
    this.W = W;
    this.H = H;
  }

  newPage() {
    if (this.cur) this.pages.push(this.cur);
    this.cur = '';
  }

  finish() {
    this.pages.push(this.cur);
    this.cur = '';
  }

  private Y(y: number) {
    return (this.H - y).toFixed(2);
  }

  measure(s: string, size: number, font: Font = 'R') {
    return widthOf(sanitize(s), size, font === 'B' || font === 'BI');
  }

  wrap(s: string, size: number, font: Font, maxW: number): string[] {
    const text = sanitize(s).trim();
    if (!text) return [];
    const bold = font === 'B' || font === 'BI';
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    const push = () => {
      if (line) lines.push(line);
      line = '';
    };
    for (const word of words) {
      const trial = line ? line + ' ' + word : word;
      if (widthOf(trial, size, bold) <= maxW) {
        line = trial;
      } else {
        push();
        if (widthOf(word, size, bold) <= maxW) {
          line = word;
        } else {
          // very long word: break by characters
          let chunk = '';
          for (const ch of word) {
            if (widthOf(chunk + ch, size, bold) > maxW) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          line = chunk;
        }
      }
    }
    push();
    return lines;
  }

  /** Draw text. align l: x is left edge; r: x is right edge; c: x is centre. y is the baseline (top-down). */
  text(x: number, y: number, s: string, size: number, font: Font = 'R', align: 'l' | 'r' | 'c' = 'l', gray = 0) {
    const t = sanitize(s);
    if (!t) return;
    const bold = font === 'B' || font === 'BI';
    const w = widthOf(t, size, bold);
    let px = x;
    if (align === 'r') px = x - w;
    if (align === 'c') px = x - w / 2;
    const f = font === 'B' ? 'F2' : font === 'I' ? 'F3' : font === 'BI' ? 'F4' : 'F1';
    this.cur += `${gray} g BT /${f} ${size.toFixed(2)} Tf ${px.toFixed(2)} ${this.Y(y)} Td (${pdfEscape(t)}) Tj ET\n`;
  }

  line(x1: number, y1: number, x2: number, y2: number, w = 0.5) {
    this.cur += `0 G ${w.toFixed(2)} w ${x1.toFixed(2)} ${this.Y(y1)} m ${x2.toFixed(2)} ${this.Y(y2)} l S\n`;
  }

  rect(x: number, y: number, w: number, h: number, lw = 0.5) {
    this.cur += `0 G ${lw.toFixed(2)} w ${x.toFixed(2)} ${(this.H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re S\n`;
  }

  fillRect(x: number, y: number, w: number, h: number, gray = 0) {
    this.cur += `${gray} g ${x.toFixed(2)} ${(this.H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f\n`;
  }

  build(title: string): Uint8Array {
    const n = this.pages.length;
    const objs: string[] = [];
    const firstPageObj = 7;
    const kids = this.pages.map((_, i) => `${firstPageObj + i * 2} 0 R`).join(' ');
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`;
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    objs[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>';
    objs[6] = `<< /Title (${pdfEscape(sanitize(title))}) /Producer (Tyrebuddy Business OS) >>`;
    this.pages.forEach((content, i) => {
      const pageNo = firstPageObj + i * 2;
      const contentNo = pageNo + 1;
      objs[pageNo] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.W.toFixed(2)} ${this.H.toFixed(2)}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 4 0 R >> >> /Contents ${contentNo} 0 R >>`;
      objs[contentNo] = `<< /Length ${content.length} >>\nstream\n${content}endstream`;
    });

    let out = '%PDF-1.4\n';
    const offsets: number[] = [];
    for (let i = 1; i < objs.length; i++) {
      offsets[i] = out.length;
      out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
    }
    const xrefPos = out.length;
    out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
    for (let i = 1; i < objs.length; i++) {
      out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}

export function renderInvoicePdf(model: InvoiceModel, opts: InvoiceOptions, extras: InvoicePdfExtras): Uint8Array {
  const A5 = opts.paper === 'A5';
  const W = A5 ? 419.53 : 595.28;
  const H = A5 ? 595.28 : 841.89;
  const k = A5 ? 0.84 : 1;
  const m = A5 ? 16 : 26;
  const L = m;
  const R = W - m;
  const CW = R - L;
  const pad = 3.4 * k;

  const base = 8 * k;
  const small = 6.6 * k;
  const big = 9.4 * k;
  const lh = base * 1.28;

  const isTax = model.mode === 'TAX';
  const pdf = new PdfBuilder(W, H);

  // ---------- table columns ----------
  const cSl = 22 * k;
  const cHsn = isTax ? 58 * k : 0;
  const cQty = 52 * k;
  const cRate = 60 * k;
  const cPer = 28 * k;
  const cAmt = 74 * k;
  const cDesc = CW - cSl - cHsn - cQty - cRate - cPer - cAmt;
  const xSl = L;
  const xDesc = xSl + cSl;
  const xHsn = xDesc + cDesc;
  const xQty = xHsn + cHsn;
  const xRate = xQty + cQty;
  const xPer = xRate + cRate;
  const xAmt = xPer + cPer;
  const colEdges = isTax ? [xDesc, xHsn, xQty, xRate, xPer, xAmt] : [xDesc, xQty, xRate, xPer, xAmt];

  // ---------- header block heights ----------
  const LW = Math.round(CW * 0.5);
  const rightX = L + LW;
  const cellW = (R - rightX) / 2;
  const cellH = 24 * k;

  const partyLines = (p: InvoiceModel['seller'], label: string | null, showGstin: boolean, isSeller: boolean) => {
    const out: { text: string; font: Font; size: number; gray?: number }[] = [];
    if (label) out.push({ text: label, font: 'R', size: small, gray: 0.35 });
    out.push({ text: p.name, font: 'B', size: big });
    p.addressLines.forEach(a => pdf.wrap(a, base, 'R', LW - 2 * pad).forEach(t => out.push({ text: t, font: 'R', size: base })));
    if (showGstin && p.gstin) out.push({ text: `GSTIN/UIN: ${p.gstin}`, font: 'R', size: base });
    if (p.stateName) out.push({ text: `State Name : ${p.stateName}${p.stateCode ? ', Code : ' + p.stateCode : ''}`, font: 'R', size: base });
    if (p.phone) out.push({ text: `Contact : ${p.phone}`, font: 'R', size: base });
    if (isSeller && p.email) out.push({ text: `E-Mail : ${p.email}`, font: 'R', size: base });
    return out;
  };

  const sellerL = partyLines(model.seller, null, true, true);
  const buyerL = partyLines(model.buyer, 'Buyer (Bill to)', opts.show.buyerGstin, false);
  const consigneeL = model.consignee ? partyLines(model.consignee, 'Consignee (Ship to)', opts.show.buyerGstin, false) : [];
  const blockH = (ls: { size: number }[]) => ls.reduce((s, l) => s + l.size * 1.3, 0) + 2 * pad;
  const leftH = blockH(sellerL) + blockH(buyerL) + (consigneeL.length ? blockH(consigneeL) : 0);

  const dispatchPairs: [{ label: string; value: string }, { label: string; value: string } | null][] = [];
  dispatchPairs.push([{ label: 'Invoice No.', value: model.invoiceNo }, { label: 'Dated', value: model.dated }]);
  for (let i = 0; i < model.dispatch.length; i += 2) dispatchPairs.push([model.dispatch[i], model.dispatch[i + 1] || null]);
  const rightH = dispatchPairs.length * cellH;
  const headerH = Math.max(leftH, rightH);

  // ---------- footer heights ----------
  const showRound = opts.show.roundOff && Math.abs(model.roundOff) > 0.0001;
  const taxRowH = 11.5 * k;
  const totalRowH = 16 * k;
  const TH = (model.taxLines.length || showRound ? 4 * k : 0) + model.taxLines.length * taxRowH + (showRound ? taxRowH : 0) + totalRowH;

  const wordsLines = pdf.wrap(model.amountWords, big, 'B', CW - 2 * pad);
  const WH = 11 * k + wordsLines.length * big * 1.3 + 2 * pad + (model.remarks ? 11 * k : 0);

  const showHsn = isTax && opts.show.hsnSummary && model.hsnRows.length > 0;
  const hsnHeadH = 20 * k;
  const hsnRowH = 11 * k;
  const HH = showHsn ? hsnHeadH + (model.hsnRows.length + 1) * hsnRowH : 0;

  const taxWordLines = isTax && opts.show.taxWords ? pdf.wrap(`Tax Amount (in words) : ${model.taxWords}`, base, 'B', CW - 2 * pad) : [];
  const TWH = taxWordLines.length ? taxWordLines.length * base * 1.3 + 2 * pad : 0;

  const declText = extras.declaration || DEFAULT_DECLARATION;
  const bottomLW = Math.round(CW * 0.56);
  const declLines = opts.show.declaration ? pdf.wrap(declText, small * 1.05, 'R', bottomLW - 2 * pad) : [];
  const bankRows: string[] = [];
  if (opts.show.bank && extras.bank) {
    bankRows.push(`A/c Holder's Name : ${extras.bank.holder}`);
    bankRows.push(`Bank Name : ${extras.bank.bankName}`);
    bankRows.push(`A/c No. : ${extras.bank.accountNo}`);
    bankRows.push(`Branch & IFS Code : ${[extras.bank.branch, extras.bank.ifsc].filter(Boolean).join(' & ')}`);
  }
  const upiOn = opts.show.upi && !!extras.upiId;
  const qrSize = upiOn && extras.qr ? 54 * k : 0;
  const leftBottomH =
    (declLines.length ? 10 * k + declLines.length * small * 1.35 : 0) +
    (bankRows.length ? 4 * k + 10 * k + bankRows.length * small * 1.4 : 0) +
    (upiOn ? Math.max(qrSize, 10 * k) + 4 * k : 0) +
    2 * pad;
  const BH = Math.max(leftBottomH, 66 * k);

  const FH = TH + WH + HH + TWH + BH;

  const belowH = 24 * k;
  const titleH = (model.subtitle ? 28 : 20) * k;
  const boxBottomMax = H - m - belowH;

  // ---------- paginate item rows ----------
  const descW = cDesc - 2 * pad;
  const rowLayouts = model.rows.map(r => {
    const nameLines = pdf.wrap(r.name, base, 'B', descW);
    const detailLines = opts.show.itemDetails && r.detail ? pdf.wrap(r.detail, small, 'R', descW) : [];
    const h = nameLines.length * lh + detailLines.length * small * 1.3 + 2 * pad;
    return { r, nameLines, detailLines, h };
  });

  const stripH = 15 * k; // header strip on continuation pages
  const tableHeadH = 15 * k;
  const firstBodyTop = m + titleH + headerH + tableHeadH;
  const nextBodyTop = m + titleH + stripH + tableHeadH;
  const limitMid = boxBottomMax - 12 * k;
  const limitLast = boxBottomMax - FH;

  const pageRows: (typeof rowLayouts)[] = [];
  let curRows: typeof rowLayouts = [];
  let y = firstBodyTop;
  rowLayouts.forEach(rl => {
    if (y + rl.h > limitMid && curRows.length > 0) {
      pageRows.push(curRows);
      curRows = [];
      y = nextBodyTop;
    }
    curRows.push(rl);
    y += rl.h;
  });
  if (y > limitLast && curRows.length > 0) {
    pageRows.push(curRows);
    curRows = [];
  }
  pageRows.push(curRows); // final page (may be empty when the footer had to move)

  // ---------- draw ----------
  const drawTableHeader = (yTop: number) => {
    pdf.line(L, yTop, R, yTop);
    pdf.line(L, yTop + tableHeadH, R, yTop + tableHeadH);
    const ty = yTop + tableHeadH * 0.68;
    pdf.text(xSl + cSl / 2, ty, 'Sl', base, 'B', 'c');
    pdf.text(xDesc + cDesc / 2, ty, 'Description of Goods', base, 'B', 'c');
    if (isTax) pdf.text(xHsn + cHsn / 2, ty, 'HSN/SAC', base, 'B', 'c');
    pdf.text(xQty + cQty / 2, ty, 'Quantity', base, 'B', 'c');
    pdf.text(xRate + cRate / 2, ty, 'Rate', base, 'B', 'c');
    pdf.text(xPer + cPer / 2, ty, 'per', base, 'B', 'c');
    pdf.text(xAmt + cAmt / 2, ty, 'Amount', base, 'B', 'c');
  };

  const drawRow = (rl: (typeof rowLayouts)[number], yTop: number) => {
    const r = rl.r;
    let ty = yTop + pad + base * 0.95;
    pdf.text(xSl + cSl / 2, ty, String(r.sl), base, 'R', 'c');
    rl.nameLines.forEach((t, i) => pdf.text(xDesc + pad, ty + i * lh, t, base, 'B'));
    let dy = ty + (rl.nameLines.length - 1) * lh + small * 1.3 + 1;
    rl.detailLines.forEach(t => {
      pdf.text(xDesc + pad, dy, t, small, 'R', 'l', 0.35);
      dy += small * 1.3;
    });
    if (isTax) pdf.text(xHsn + pad, ty, r.hsn, base, 'R');
    pdf.text(xQty + cQty - pad, ty, `${r.qty} ${r.unit}`, base, 'B', 'r');
    pdf.text(xRate + cRate - pad, ty, fmtMoney(r.rate), base, 'R', 'r');
    pdf.text(xPer + cPer / 2, ty, r.unit, base, 'R', 'c');
    pdf.text(xAmt + cAmt - pad, ty, fmtMoney(r.amount), base, 'B', 'r');
  };

  const drawVerticals = (yTop: number, yBottom: number) => {
    colEdges.forEach(x => pdf.line(x, yTop, x, yBottom));
  };

  pageRows.forEach((rowsOnPage, pageIdx) => {
    if (pageIdx > 0) pdf.newPage();
    const isFirst = pageIdx === 0;
    const isLast = pageIdx === pageRows.length - 1;
    const boxTop = m + titleH;

    // Title
    pdf.text(W / 2, m + 14 * k, model.title + (isFirst ? '' : ' (continued)'), 12 * k, 'B', 'c');
    if (model.subtitle && isFirst) pdf.text(W / 2, m + 23 * k, model.subtitle, small, 'R', 'c', 0.35);

    // Outer box
    pdf.rect(L, boxTop, CW, boxBottomMax - boxTop, 0.9);

    let tableTop: number;
    if (isFirst) {
      // left parties
      let ly = boxTop;
      const drawParty = (ls: ReturnType<typeof partyLines>, top: number) => {
        let yy = top + pad;
        ls.forEach(l => {
          yy += l.size * 1.0;
          pdf.text(L + pad, yy, l.text, l.size, l.font, 'l', l.gray ?? 0);
          yy += l.size * 0.3;
        });
        return top + blockH(ls);
      };
      ly = drawParty(sellerL, ly);
      pdf.line(L, ly, L + LW, ly);
      ly = drawParty(buyerL, ly);
      if (consigneeL.length) {
        pdf.line(L, ly, L + LW, ly);
        drawParty(consigneeL, ly);
      }

      // right grid
      dispatchPairs.forEach((pair, i) => {
        const cy = boxTop + i * cellH;
        if (i > 0) pdf.line(rightX, cy, R, cy);
        [pair[0], pair[1]].forEach((cell, j) => {
          if (!cell) return;
          const cx = rightX + j * cellW;
          pdf.text(cx + pad, cy + 7.5 * k, cell.label, small, 'R', 'l', 0.35);
          pdf.text(cx + pad, cy + 17.5 * k, cell.value, base, 'B');
        });
        pdf.line(rightX + cellW, cy, rightX + cellW, cy + cellH);
      });
      pdf.line(rightX, boxTop, rightX, boxTop + headerH);
      tableTop = boxTop + headerH;
    } else {
      pdf.text(L + pad, boxTop + stripH * 0.7, `Invoice No. ${model.invoiceNo}    Dated ${model.dated}`, base, 'B');
      tableTop = boxTop + stripH;
    }

    drawTableHeader(tableTop);
    const bodyTop = tableTop + tableHeadH;
    let yy = bodyTop;
    rowsOnPage.forEach(rl => {
      drawRow(rl, yy);
      yy += rl.h;
    });

    if (!isLast) {
      drawVerticals(tableTop, boxBottomMax);
      pdf.text(R - pad, boxBottomMax - 4 * k, 'continued ...', small, 'I', 'r', 0.35);
    } else {
      const footerTop = boxBottomMax - FH;
      drawVerticals(tableTop, footerTop + TH);

      // tax lines + round off
      let ty = footerTop + (model.taxLines.length || showRound ? 4 * k : 0);
      model.taxLines.forEach(tl => {
        pdf.text(xHsn - pad, ty + taxRowH * 0.75, tl.label, base, 'BI', 'r');
        pdf.text(xAmt + cAmt - pad, ty + taxRowH * 0.75, fmtMoney(tl.amount), base, 'B', 'r');
        ty += taxRowH;
      });
      if (showRound) {
        pdf.text(xHsn - pad, ty + taxRowH * 0.75, 'Round Off', base, 'I', 'r');
        const ro = model.roundOff;
        pdf.text(xAmt + cAmt - pad, ty + taxRowH * 0.75, ro < 0 ? `(-)${fmtMoney(Math.abs(ro))}` : fmtMoney(ro), base, 'R', 'r');
        ty += taxRowH;
      }
      // total row
      pdf.line(L, ty, R, ty);
      pdf.line(L, ty + totalRowH, R, ty + totalRowH);
      const tyb = ty + totalRowH * 0.7;
      pdf.text(xHsn - pad, tyb, 'Total', base, 'B', 'r');
      pdf.text(xQty + cQty - pad, tyb, `${model.totalQty} Pcs`, base, 'B', 'r');
      pdf.text(xAmt + cAmt - pad, tyb, `Rs. ${fmtMoney(model.grandTotal)}`, base, 'B', 'r');

      // amount in words
      let by = footerTop + TH;
      pdf.text(L + pad, by + 8 * k, 'Amount Chargeable (in words)', small, 'R', 'l', 0.35);
      pdf.text(R - pad, by + 8 * k, 'E. & O.E', small, 'I', 'r', 0.35);
      let wy = by + 8 * k + big * 1.15;
      wordsLines.forEach(t => {
        pdf.text(L + pad, wy, t, big, 'B');
        wy += big * 1.3;
      });
      if (model.remarks) {
        pdf.text(L + pad, wy + 2 * k, `Remarks: ${model.remarks}`, small, 'I', 'l', 0.25);
      }
      by += WH;

      // HSN summary
      if (showHsn) {
        pdf.line(L, by, R, by);
        const intra = model.isIntraState;
        const cTax = 62 * k;
        const cRt = 28 * k;
        const cAm = 50 * k;
        const cTaxable = 70 * k;
        const groupCols = intra ? 2 : 1;
        const hsnCols: { x: number; w: number }[] = [];
        let cx = R - cTax;
        const xTotalTax = cx;
        const taxGroups: { x: number; w: number; label: string }[] = [];
        for (let g = groupCols - 1; g >= 0; g--) {
          const gw = cRt + cAm;
          cx -= gw;
          taxGroups[g] = { x: cx, w: gw, label: intra ? (g === 0 ? 'Central Tax' : 'State Tax') : 'Integrated Tax' };
        }
        const xTaxable = taxGroups[0].x - cTaxable;
        hsnCols.push({ x: L, w: xTaxable - L });

        // headers
        const hy = by;
        pdf.text(L + (xTaxable - L) / 2, hy + hsnHeadH * 0.6, 'HSN/SAC', base, 'B', 'c');
        pdf.text(xTaxable + cTaxable / 2, hy + hsnHeadH * 0.6, 'Taxable Value', base, 'B', 'c');
        taxGroups.forEach(g => {
          pdf.text(g.x + g.w / 2, hy + hsnHeadH * 0.38, g.label, base, 'B', 'c');
          pdf.line(g.x, hy + hsnHeadH / 2, g.x + g.w, hy + hsnHeadH / 2);
          pdf.text(g.x + cRt / 2, hy + hsnHeadH * 0.88, 'Rate', small, 'B', 'c');
          pdf.text(g.x + cRt + cAm / 2, hy + hsnHeadH * 0.88, 'Amount', small, 'B', 'c');
        });
        pdf.text(xTotalTax + cTax / 2, hy + hsnHeadH * 0.4, 'Total', base, 'B', 'c');
        pdf.text(xTotalTax + cTax / 2, hy + hsnHeadH * 0.8, 'Tax Amount', base, 'B', 'c');
        pdf.line(L, hy + hsnHeadH, R, hy + hsnHeadH);

        let ry = hy + hsnHeadH;
        const totals = { taxable: 0, a1: 0, a2: 0, tt: 0 };
        model.hsnRows.forEach(row => {
          const base1 = ry + hsnRowH * 0.76;
          pdf.text(L + pad, base1, row.hsn, base, 'R');
          pdf.text(xTaxable + cTaxable - pad, base1, fmtMoney(row.taxable), base, 'R', 'r');
          if (intra) {
            pdf.text(taxGroups[0].x + cRt - pad, base1, `${row.cgstRate}%`, base, 'R', 'r');
            pdf.text(taxGroups[0].x + cRt + cAm - pad, base1, fmtMoney(row.cgstAmt), base, 'R', 'r');
            pdf.text(taxGroups[1].x + cRt - pad, base1, `${row.sgstRate}%`, base, 'R', 'r');
            pdf.text(taxGroups[1].x + cRt + cAm - pad, base1, fmtMoney(row.sgstAmt), base, 'R', 'r');
            totals.a1 += row.cgstAmt;
            totals.a2 += row.sgstAmt;
          } else {
            pdf.text(taxGroups[0].x + cRt - pad, base1, `${row.igstRate}%`, base, 'R', 'r');
            pdf.text(taxGroups[0].x + cRt + cAm - pad, base1, fmtMoney(row.igstAmt), base, 'R', 'r');
            totals.a1 += row.igstAmt;
          }
          pdf.text(xTotalTax + cTax - pad, base1, fmtMoney(row.totalTax), base, 'R', 'r');
          totals.taxable += row.taxable;
          totals.tt += row.totalTax;
          ry += hsnRowH;
        });
        // total row
        const tb = ry + hsnRowH * 0.76;
        pdf.line(L, ry, R, ry);
        pdf.text(L + (xTaxable - L) - pad, tb, 'Total', base, 'B', 'r');
        pdf.text(xTaxable + cTaxable - pad, tb, fmtMoney(totals.taxable), base, 'B', 'r');
        pdf.text(taxGroups[0].x + cRt + cAm - pad, tb, fmtMoney(totals.a1), base, 'B', 'r');
        if (intra) pdf.text(taxGroups[1].x + cRt + cAm - pad, tb, fmtMoney(totals.a2), base, 'B', 'r');
        pdf.text(xTotalTax + cTax - pad, tb, fmtMoney(totals.tt), base, 'B', 'r');

        // vertical lines of the summary table
        const sumBottom = ry + hsnRowH;
        [xTaxable, ...taxGroups.map(g => g.x), xTotalTax].forEach(x => pdf.line(x, hy, x, sumBottom));
        taxGroups.forEach(g => pdf.line(g.x + cRt, hy + hsnHeadH / 2, g.x + cRt, sumBottom));
        by = sumBottom;
      }

      // tax in words
      if (taxWordLines.length) {
        pdf.line(L, by, R, by);
        let ty2 = by + pad + base * 0.95;
        taxWordLines.forEach(t => {
          pdf.text(L + pad, ty2, t, base, 'B');
          ty2 += base * 1.3;
        });
        by += TWH;
      }

      // bottom: declaration / bank / signature
      pdf.line(L, by, R, by);
      pdf.line(L + bottomLW, by, L + bottomLW, boxBottomMax);
      let dy = by + pad;
      if (declLines.length) {
        dy += 7 * k;
        pdf.text(L + pad, dy, 'Declaration', small * 1.1, 'B');
        pdf.line(L + pad, dy + 1.2, L + pad + pdf.measure('Declaration', small * 1.1, 'B'), dy + 1.2, 0.4);
        declLines.forEach(t => {
          dy += small * 1.35;
          pdf.text(L + pad, dy, t, small * 1.05, 'R');
        });
      }
      if (bankRows.length) {
        dy += 6 * k;
        pdf.text(L + pad, dy + 3 * k, "Company's Bank Details", small * 1.1, 'B');
        dy += 3 * k;
        bankRows.forEach(t => {
          dy += small * 1.4;
          pdf.text(L + pad, dy, t, small, 'R');
        });
      }
      if (upiOn) {
        dy += 6 * k;
        if (extras.qr && qrSize > 0) {
          const qr = extras.qr;
          const cell = qrSize / qr.size;
          for (let row = 0; row < qr.size; row++) {
            let col = 0;
            while (col < qr.size) {
              if (qr.data[row * qr.size + col]) {
                let end = col;
                while (end < qr.size && qr.data[row * qr.size + end]) end++;
                pdf.fillRect(L + pad + col * cell, dy + row * cell, (end - col) * cell, cell + 0.15, 0);
                col = end;
              } else {
                col++;
              }
            }
          }
          pdf.text(L + pad + qrSize + 6 * k, dy + 10 * k, 'Scan to pay (UPI)', small, 'B');
          pdf.text(L + pad + qrSize + 6 * k, dy + 20 * k, extras.upiId || '', small, 'R');
        } else {
          pdf.text(L + pad, dy + 8 * k, `UPI ID : ${extras.upiId}`, small, 'R');
        }
      }

      // signature box (right)
      const sx = L + bottomLW;
      const sw = R - sx;
      pdf.text(sx + sw / 2, by + 10 * k, `for ${extras.businessName}`, base, 'B', 'c');
      pdf.text(sx + sw / 2, boxBottomMax - 5 * k, 'Authorised Signatory', base, 'R', 'c');
    }

    // Below the box
    pdf.text(W / 2, boxBottomMax + 10 * k, `SUBJECT TO ${extras.jurisdiction.toUpperCase()} JURISDICTION`, small * 1.15, 'B', 'c');
    pdf.text(W / 2, boxBottomMax + 19 * k, 'This is a Computer Generated Invoice', small, 'R', 'c', 0.35);
  });

  pdf.finish();
  return pdf.build(`${model.title} ${model.invoiceNo}`);
}
