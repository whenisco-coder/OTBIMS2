import type { InvoicePaper } from './invoiceModel';

const MM_TO_PX = 3.7795275591;

export function paperHeightPx(paper: InvoicePaper): number {
  const mmHeights: Record<InvoicePaper, number> = {
    A4: 297,
    A5: 210,
    A6: 148,
    THERMAL_4x6: 6 * 25.4,
    THERMAL_2: 8 * 25.4,
    THERMAL_3: 8 * 25.4,
  };
  return mmHeights[paper] * MM_TO_PX;
}

export function paperWidthPx(paper: InvoicePaper): number {
  const mmWidths: Record<InvoicePaper, number> = {
    A4: 210,
    A5: 148,
    A6: 105,
    THERMAL_4x6: 4 * 25.4,
    THERMAL_2: 2 * 25.4,
    THERMAL_3: 3 * 25.4,
  };
  return mmWidths[paper] * MM_TO_PX;
}

/** Approximate height of the courier label block on the sheet, in px. */
export const LABEL_HEIGHT_PX = 60 * MM_TO_PX;
export const CUT_LINE_HEIGHT_PX = 30;

export interface OverflowPrediction {
  invoiceHeightPx: number;
  availablePx: number;
  /** True when the invoice alone fits inside the paper. */
  invoiceFits: boolean;
  /** True when invoice + cut line + label all fit on one sheet. */
  combinedFits: boolean;
  /** mm by which the invoice alone overflows (0 if it fits). */
  overflowMm: number;
}

export function predictOverflow(
  invoiceElement: HTMLElement,
  paper: InvoicePaper
): OverflowPrediction {
  const marginMm = 6;
  const available = paperHeightPx(paper) - 2 * marginMm * MM_TO_PX;
  const invoiceHeight = invoiceElement.getBoundingClientRect().height;

  const neededForCombined = invoiceHeight + CUT_LINE_HEIGHT_PX + LABEL_HEIGHT_PX;

  return {
    invoiceHeightPx: Math.round(invoiceHeight),
    availablePx: Math.round(available),
    invoiceFits: invoiceHeight <= available,
    combinedFits: neededForCombined <= available,
    overflowMm: Math.max(0, Math.round((invoiceHeight - available) / MM_TO_PX)),
  };
}
