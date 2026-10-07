/**
 * Invoice model: one place that turns an Order into everything an invoice shows.
 * The on-screen preview and the generated PDF both read from this, so they always match.
 *
 * Hidden items are removed here, and every total is recalculated from the items that are shown.
 */

import type { Order, BusinessSettings } from '../types';
import { numberToIndianWords } from './numberToWords';
import { stateCodeFor } from './addressParser';

export type InvoiceMode = 'TAX' | 'SIMPLE';
export type InvoicePaper = 'A4' | 'A5';

export interface InvoiceOptions {
  mode: InvoiceMode; // TAX = Tally style tax invoice, SIMPLE = retail bill (price includes GST, no tax columns)
  paper: InvoicePaper;
  hiddenItemIds: string[]; // items the user chose NOT to show on this invoice
  roundTo: 0 | 1 | 10; // 1 = nearest rupee (default), 10 = nearest 10 rupees, 0 = no rounding
  show: {
    dispatch: boolean; // delivery note / dispatch / destination block
    hsnSummary: boolean;
    taxWords: boolean;
    bank: boolean;
    upi: boolean; // UPI QR + id
    declaration: boolean;
    buyerGstin: boolean;
    itemDetails: boolean; // small SKU / brand line under each item name
    roundOff: boolean;
    remarks: boolean;
    shipTo: boolean; // separate consignee block when shipping address differs
  };
  fields: {
    deliveryNote: string;
    dispatchDocNo: string;
    dispatchedThrough: string;
    destination: string;
    termsOfPayment: string;
    buyerOrderNo: string;
  };
  jurisdiction: string;
}

export function defaultInvoiceOptions(order: Order, settings?: Partial<BusinessSettings>): InvoiceOptions {
  const isB2B = order.customerType === 'B2B';
  return {
    mode: 'TAX',
    paper: 'A4',
    hiddenItemIds: [],
    roundTo: 1,
    show: {
      dispatch: true,
      hsnSummary: true,
      taxWords: true,
      bank: isB2B,
      upi: false,
      declaration: true,
      buyerGstin: true,
      itemDetails: false,
      roundOff: true,
      remarks: true,
      shipTo: true,
    },
    fields: {
      deliveryNote: '',
      dispatchDocNo: order.awbNumber || '',
      dispatchedThrough: order.courierName || '',
      destination: order.shippingAddress?.city || '',
      termsOfPayment: '',
      buyerOrderNo: '',
    },
    jurisdiction: (settings as any)?.jurisdiction || 'Surat',
  };
}

/** Merge saved options over defaults so older saved versions never break after an update. */
export function mergeInvoiceOptions(base: InvoiceOptions, saved: any): InvoiceOptions {
  if (!saved || typeof saved !== 'object') return base;
  return {
    ...base,
    ...saved,
    show: { ...base.show, ...(saved.show || {}) },
    fields: { ...base.fields, ...(saved.fields || {}) },
    hiddenItemIds: Array.isArray(saved.hiddenItemIds) ? saved.hiddenItemIds : base.hiddenItemIds,
  };
}

export interface InvoiceRow {
  sl: number;
  name: string;
  detail: string;
  hsn: string;
  qty: number;
  unit: string;
  rate: number;
  amount: number;
  gstPercent: number;
}

export interface InvoiceTaxLine {
  label: string;
  amount: number;
}

export interface InvoiceHsnRow {
  hsn: string;
  taxable: number;
  cgstRate: number;
  cgstAmt: number;
  sgstRate: number;
  sgstAmt: number;
  igstRate: number;
  igstAmt: number;
  totalTax: number;
}

export interface InvoiceParty {
  name: string;
  addressLines: string[];
  gstin: string;
  stateName: string;
  stateCode: string;
  phone?: string;
  email?: string;
}

export interface InvoiceModel {
  title: string;
  subtitle: string;
  mode: InvoiceMode;
  isIntraState: boolean;
  invoiceNo: string;
  dated: string;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  consignee: InvoiceParty | null;
  dispatch: { label: string; value: string }[];
  rows: InvoiceRow[];
  taxLines: InvoiceTaxLine[];
  hsnRows: InvoiceHsnRow[];
  totalQty: number;
  taxableTotal: number;
  taxTotal: number;
  rawTotal: number;
  roundOff: number;
  grandTotal: number;
  amountWords: string;
  taxWords: string;
  remarks: string;
  hiddenCount: number;
  orderGrandTotal: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function formatDateTally(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
}

export function inrWords(amount: number): string {
  const w = numberToIndianWords(Math.abs(amount));
  return w.replace(/^INR\s+/, 'Indian Rupees ').replace(/ Paise/g, ' paise');
}

/** 12816 -> "12,816.00" (Indian grouping, no currency symbol so it works in the PDF font too) */
export function fmtMoney(n: number): string {
  const v = round2(n);
  const neg = v < 0;
  const fixed = Math.abs(v).toFixed(2);
  const [intPart, dec] = fixed.split('.');
  let grouped = intPart;
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    grouped = rest + ',' + last3;
  }
  return (neg ? '-' : '') + grouped + '.' + dec;
}

const cleanLines = (parts: (string | undefined)[]) => parts.map(p => (p || '').trim()).filter(Boolean);

export function buildInvoiceModel(order: Order, settings: BusinessSettings, products: any[], opts: InvoiceOptions): InvoiceModel {
  const hidden = new Set(opts.hiddenItemIds);
  const visible = order.items.filter(it => !hidden.has(it.id));
  const isIntra = !!order.isGujarat;
  const tax = opts.mode === 'TAX';

  const rows: InvoiceRow[] = visible.map((it, i) => {
    const prod = products.find(p => p.id === it.productId);
    const detailBits = [prod?.brand, it.sku ? `SKU: ${it.sku}` : '', prod?.warrantyMonths ? `${prod.warrantyMonths}M Warranty` : ''].filter(Boolean);
    return {
      sl: i + 1,
      name: it.name,
      detail: detailBits.join(' | '),
      hsn: it.hsn || '',
      qty: it.qty,
      unit: 'Pcs',
      rate: tax ? it.unitPrice : round2(it.totalAmount / (it.qty || 1)),
      amount: tax ? it.taxableAmount : it.totalAmount,
      gstPercent: it.gstPercent,
    };
  });

  const totalQty = visible.reduce((s, it) => s + it.qty, 0);
  const taxableTotal = round2(visible.reduce((s, it) => s + it.taxableAmount, 0));
  const cgst = round2(visible.reduce((s, it) => s + it.cgstAmount, 0));
  const sgst = round2(visible.reduce((s, it) => s + it.sgstAmount, 0));
  const igst = round2(visible.reduce((s, it) => s + it.igstAmount, 0));
  const taxTotal = round2(cgst + sgst + igst);
  const itemsGross = round2(visible.reduce((s, it) => s + it.totalAmount, 0));

  // Tax lines grouped by rate, like Tally: "CGST @ 9 %", "SGST @ 9 %" or "IGST @ 18 %"
  const taxLines: InvoiceTaxLine[] = [];
  if (tax) {
    const byRate = new Map<number, { cgst: number; sgst: number; igst: number }>();
    visible.forEach(it => {
      const cur = byRate.get(it.gstPercent) || { cgst: 0, sgst: 0, igst: 0 };
      cur.cgst += it.cgstAmount;
      cur.sgst += it.sgstAmount;
      cur.igst += it.igstAmount;
      byRate.set(it.gstPercent, cur);
    });
    Array.from(byRate.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([rate, v]) => {
        if (isIntra) {
          taxLines.push({ label: `CGST @ ${rate / 2} %`, amount: round2(v.cgst) });
          taxLines.push({ label: `SGST @ ${rate / 2} %`, amount: round2(v.sgst) });
        } else {
          taxLines.push({ label: `IGST @ ${rate} %`, amount: round2(v.igst) });
        }
      });
  }

  const rawTotal = tax ? round2(taxableTotal + taxTotal) : itemsGross;
  const roundTo = opts.roundTo === 10 || opts.roundTo === 0 ? opts.roundTo : 1;
  const grandTotal = roundTo === 0 ? rawTotal : Math.round(rawTotal / roundTo) * roundTo;
  const roundOff = round2(grandTotal - rawTotal);

  // HSN summary
  const hsnMap = new Map<string, InvoiceHsnRow>();
  visible.forEach(it => {
    const key = `${it.hsn}|${it.gstPercent}`;
    const cur =
      hsnMap.get(key) ||
      ({
        hsn: it.hsn || '-',
        taxable: 0,
        cgstRate: isIntra ? it.gstPercent / 2 : 0,
        cgstAmt: 0,
        sgstRate: isIntra ? it.gstPercent / 2 : 0,
        sgstAmt: 0,
        igstRate: isIntra ? 0 : it.gstPercent,
        igstAmt: 0,
        totalTax: 0,
      } as InvoiceHsnRow);
    cur.taxable += it.taxableAmount;
    cur.cgstAmt += it.cgstAmount;
    cur.sgstAmt += it.sgstAmount;
    cur.igstAmt += it.igstAmount;
    cur.totalTax += it.cgstAmount + it.sgstAmount + it.igstAmount;
    hsnMap.set(key, cur);
  });
  const hsnRows = Array.from(hsnMap.values()).map(r => ({
    ...r,
    taxable: round2(r.taxable),
    cgstAmt: round2(r.cgstAmt),
    sgstAmt: round2(r.sgstAmt),
    igstAmt: round2(r.igstAmt),
    totalTax: round2(r.totalTax),
  }));

  // Parties
  const sellerStateName = settings.state || 'Gujarat';
  const seller: InvoiceParty = {
    name: settings.businessName || '',
    addressLines: cleanLines([settings.address]),
    gstin: settings.gstin || '',
    stateName: sellerStateName,
    stateCode: settings.stateCode || stateCodeFor(sellerStateName),
    phone: settings.phone,
    email: settings.email,
  };

  const bill = order.billingAddress || order.shippingAddress;
  const buyer: InvoiceParty = {
    name: order.customerName || '',
    addressLines: cleanLines([bill?.addressLine, [bill?.city, bill?.pincode ? '- ' + bill.pincode : ''].filter(Boolean).join(' ')]),
    gstin: order.customerGstin || '',
    stateName: bill?.state || '',
    stateCode: stateCodeFor(bill?.state || ''),
    phone: order.customerPhone,
  };

  const shipDiffers =
    !!order.billingAddress &&
    (order.billingAddress.addressLine !== order.shippingAddress.addressLine ||
      order.billingAddress.pincode !== order.shippingAddress.pincode);
  const ship = order.shippingAddress;
  const consignee: InvoiceParty | null =
    opts.show.shipTo && shipDiffers
      ? {
          name: order.customerName || '',
          addressLines: cleanLines([ship.addressLine, [ship.city, ship.pincode ? '- ' + ship.pincode : ''].filter(Boolean).join(' ')]),
          gstin: order.customerGstin || '',
          stateName: ship.state || '',
          stateCode: stateCodeFor(ship.state || ''),
        }
      : null;

  const dispatchRaw: { label: string; value: string }[] = [
    { label: 'Delivery Note', value: opts.fields.deliveryNote },
    { label: 'Mode/Terms of Payment', value: opts.fields.termsOfPayment || (order.paymentStatus ? String(order.paymentStatus) : '') },
    { label: 'Dispatch Doc No.', value: opts.fields.dispatchDocNo },
    { label: "Buyer's Order No.", value: opts.fields.buyerOrderNo || order.orderNo },
    { label: 'Dispatched through', value: opts.fields.dispatchedThrough },
    { label: 'Destination', value: opts.fields.destination },
  ];

  const taxInvoiceTitle = 'Tax Invoice';
  const title = order.isProforma ? 'Proforma Invoice' : tax ? taxInvoiceTitle : 'Retail Invoice / Cash Memo';
  const subtitle = order.isProforma
    ? '(Price quotation only - not a GST tax invoice)'
    : tax
    ? ''
    : '(All prices include applicable GST)';

  return {
    title,
    subtitle,
    mode: opts.mode,
    isIntraState: isIntra,
    invoiceNo: order.invoiceNo || order.orderNo,
    dated: formatDateTally(order.orderDate),
    seller,
    buyer,
    consignee,
    dispatch: opts.show.dispatch ? dispatchRaw : [],
    rows,
    taxLines,
    hsnRows,
    totalQty,
    taxableTotal,
    taxTotal,
    rawTotal,
    roundOff,
    grandTotal,
    amountWords: inrWords(grandTotal),
    taxWords: inrWords(taxTotal),
    remarks: opts.show.remarks ? order.notes || '' : '',
    hiddenCount: order.items.length - visible.length,
    orderGrandTotal: order.grandTotal,
  };
}

export const DEFAULT_DECLARATION =
  'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.';
