/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Order, Product, Customer, Supplier, StockBatch, StockLocation } from '../types';
import { stateCodeFor } from './addressParser';

export interface TallyStockItem {
  name: string;
  parentGroup: string;
  hsnCode: string;
  gstRate: number;
  openingQty: number;
  openingRate: number;
  openingValue: number;
  uom: string;
  partNo?: string;
  costPrice: number;
  retailPrice: number;
  mrp: number;
  brand: string;
  category: string;
  sku?: string;
  barcode?: string;
}

export interface TallyLedger {
  name: string;
  parentGroup: string;
  ledgerType: 'SUNDRY_DEBTOR' | 'SUNDRY_CREDITOR' | 'BANK' | 'CASH' | 'DUTIES_TAXES' | 'SALES' | 'PURCHASE' | 'OTHER';
  gstin?: string;
  stateName: string;
  stateCode: string;
  pincode: string;
  address: string;
  city?: string;
  phone: string;
  email?: string;
  openingBalance: number;
  balanceType: 'Dr' | 'Cr';
  creditPeriodDays: number;
  creditLimit?: number;
}

export interface TallyVoucher {
  voucherType: string;
  voucherNo: string;
  date: string;
  partyName: string;
  amount: number; // grand total of the voucher
  narration?: string;
  guid?: string;
  partyGstin?: string;
  placeOfSupply?: string;
  buyerAddress?: string;
  buyerPincode?: string;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  taxable: number;
  isCancelled: boolean;
  items: Array<{
    name: string;
    qty: number;
    unit: string;
    rate: number;
    amount: number; // taxable amount of this line
    hsn?: string;
    gstPercent?: number;
  }>;
}

export interface ImportFlag {
  kind: 'item' | 'customer' | 'supplier';
  name: string;
  missing: string[]; // e.g. ['HSN', 'GST rate', 'Selling price']
}

export interface TallyParseResult {
  flags?: ImportFlag[];
  fileType: 'XML' | 'CSV' | 'UNKNOWN';
  stockItems: TallyStockItem[];
  ledgers: TallyLedger[];
  vouchers: TallyVoucher[];
  errors: string[];
  warnings: string[];
  summary: {
    totalStockItems: number;
    totalDebtors: number;
    totalCreditors: number;
    totalVouchers: number;
    rawElementCount: number;
  };
}

// Helper: Infer automotive tyre brand from item name
export function inferBrand(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes('MRF')) return 'MRF';
  if (upper.includes('APOLLO')) return 'Apollo';
  if (upper.includes('CEAT')) return 'CEAT';
  if (upper.includes('BRIDGESTONE')) return 'Bridgestone';
  if (upper.includes('GOODYEAR')) return 'Goodyear';
  if (upper.includes('MICHELIN')) return 'Michelin';
  if (upper.includes('JK TYRE') || upper.includes('JK')) return 'JK Tyre';
  if (upper.includes('YOKOHAMA')) return 'Yokohama';
  if (upper.includes('CONTINENTAL')) return 'Continental';
  if (upper.includes('PIRELLI')) return 'Pirelli';
  if (upper.includes('EXIDE')) return 'Exide';
  if (upper.includes('AMARON')) return 'Amaron';
  return '';
}

// Helper: Infer category from parent group or item name
export function inferCategory(parentGroup: string, name: string): string {
  const combined = `${parentGroup} ${name}`.toUpperCase();
  if (combined.includes('TRUCK') || combined.includes('BUS') || combined.includes('TBR') || combined.includes('COMMERCIAL')) {
    return 'Commercial Truck & Bus Tyres';
  }
  if (combined.includes('BIKE') || combined.includes('2 WHEELER') || combined.includes('TWO WHEELER') || combined.includes('SCOOTER') || combined.includes('MOTORCYCLE')) {
    return 'Two-Wheeler & Motorcycle Tyres';
  }
  if (combined.includes('TUBE') || combined.includes('FLAP')) {
    return 'Inner Tubes & Flaps';
  }
  if (combined.includes('BATTERY') || combined.includes('INVERTER') || combined.includes('EXIDE') || combined.includes('AMARON')) {
    return 'Automotive Batteries';
  }
  if (combined.includes('ALLOY') || combined.includes('RIM') || combined.includes('WHEEL')) {
    return 'Alloy Wheels & Rims';
  }
  if (combined.includes('TRACTOR') || combined.includes('AGRICULTUR') || combined.includes('OTR')) {
    return 'Agricultural & OTR Tyres';
  }
  if (/TYRE|TIRE/.test(combined)) return 'Passenger Car Tyres';
  return (parentGroup || '').trim() || 'General';
}

// Helper: Extract clean numeric value from Tally strings like "50.00 NOS", "-15000.00", "4,500.00/NOS"
export function cleanTallyNumber(val: string | null | undefined): number {
  if (!val) return 0;
  const cleaned = val.replace(/,/g, '').replace(/[^\d.-]/g, ' ').trim();
  const parts = cleaned.split(/\s+/);
  const num = parseFloat(parts[0]);
  return isNaN(num) ? 0 : Math.abs(num);
}

// ---------------------------------------------------------------------------------------------
// File reading helpers. Tally exports XML as UTF-16 and writes control characters (&#4;) that a
// browser XML parser refuses, which is why a plain file.text() + DOMParser import failed.
// ---------------------------------------------------------------------------------------------

/** Turn the raw bytes of a Tally file into text (handles UTF-16 LE/BE and UTF-8, with or without BOM). */
export function decodeTallyBytes(buf: ArrayBuffer): string {
  const u8 = new Uint8Array(buf);
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  if (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) return new TextDecoder('utf-8').decode(u8.subarray(3));
  if (u8.length >= 4 && u8[1] === 0 && u8[3] === 0 && u8[0] !== 0) return new TextDecoder('utf-16le').decode(u8);
  return new TextDecoder('utf-8').decode(u8);
}

/** Remove the characters XML 1.0 does not allow so the browser parser accepts the file. */
export function sanitizeTallyXml(xml: string): string {
  const okCode = (n: number) => n === 9 || n === 10 || n === 13 || n >= 32;
  return xml
    .replace(/^\uFEFF/, '')
    .replace(/<\?xml[^>]*\?>/i, '')
    .replace(/&#(\d+);/g, (m, d) => (okCode(parseInt(d, 10)) ? m : ''))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (m, h) => (okCode(parseInt(h, 16)) ? m : ''))
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

// ---- small DOM helpers (direct children only; CSS selectors cannot match tag names containing ".LIST") ----
function txt(el: Element | null | undefined): string {
  return (el?.textContent || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
}
function kids(el: Element, tag: string): Element[] {
  const out: Element[] = [];
  for (let i = 0; i < el.children.length; i++) {
    if (el.children[i].tagName === tag) out.push(el.children[i]);
  }
  return out;
}
function kid(el: Element, tag: string): Element | undefined {
  return kids(el, tag)[0];
}
function kidText(el: Element, tag: string): string {
  return txt(kid(el, tag));
}
function cleanLabel(s: string): string {
  const t = s.trim();
  return /^not applicable$/i.test(t) || /^applicable$/i.test(t) ? '' : t;
}
function num(s: string | undefined | null): number {
  if (!s) return 0;
  const m = s.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}
function lastWith(list: Element[], tag: string): Element | undefined {
  for (let i = list.length - 1; i >= 0; i--) {
    if (kidText(list[i], tag)) return list[i];
  }
  return undefined;
}
function tallyDate(raw: string): string {
  const d = raw.replace(/\D/g, '');
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return new Date().toISOString().split('T')[0];
}
function trimComma(s: string): string {
  return s.replace(/[\s,]+$/g, '').replace(/^[\s,]+/g, '').trim();
}

const EMPTY_SUMMARY = { totalStockItems: 0, totalDebtors: 0, totalCreditors: 0, totalVouchers: 0, rawElementCount: 0 };

/** Which top-level Tally group (Sundry Debtors, Bank Accounts...) a ledger belongs to, following custom sub-groups. */
function buildGroupResolver(doc: Document) {
  const parentOf = new Map<string, string>();
  const groups = doc.getElementsByTagName('GROUP');
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const name = (g.getAttribute('NAME') || '').trim();
    if (name) parentOf.set(name.toLowerCase(), kidText(g, 'PARENT'));
  }
  return (groupName: string): string => {
    let cur = (groupName || '').trim();
    for (let i = 0; i < 12 && cur; i++) {
      const low = cur.toLowerCase();
      if (['sundry debtors', 'sundry creditors', 'bank accounts', 'cash-in-hand', 'duties & taxes', 'sales accounts', 'purchase accounts'].includes(low)) return low;
      const next = parentOf.get(low);
      if (!next) break;
      cur = next;
    }
    return (groupName || '').trim().toLowerCase();
  };
}


/** Names the existing import screen already uses. */
export function decodeTallyBuffer(buf: ArrayBuffer): string {
  return decodeTallyBytes(buf);
}
export const cleanTallyXml = sanitizeTallyXml;
export async function readTallyFile(file: File): Promise<string> {
  return decodeTallyBytes(await file.arrayBuffer());
}

/**
 * Tally text is not always clean (cut-off files, stray & signs, damaged records).
 * Step 1: repair what can be repaired. Step 2: if the file still will not parse as a whole, keep every record
 * that is individually readable and skip only the damaged ones, so as much as possible is imported.
 */
function parseXmlTolerant(raw: string): { doc: Document; skipped: number; damaged: boolean } {
  const parser = new DOMParser();
  const repaired = sanitizeTallyXml(raw).replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#[xX][0-9a-fA-F]+);)/g, '&amp;');
  const whole = parser.parseFromString(repaired, 'text/xml');
  if (!whole.querySelector('parsererror')) return { doc: whole, skipped: 0, damaged: false };

  const blockRe = /<(STOCKITEM|LEDGER|GROUP|VOUCHER)\b[^>]*>[\s\S]*?<\/\1>/g;
  const good: string[] = [];
  let found = 0;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(repaired)) !== null) {
    found++;
    const test = parser.parseFromString(`<R>${m[0]}</R>`, 'text/xml');
    if (!test.querySelector('parsererror')) good.push(m[0]);
  }
  const opened = (repaired.match(/<(?:STOCKITEM|LEDGER|VOUCHER)\b/g) || []).length;
  const goodMain = good.filter(g => /^<(STOCKITEM|LEDGER|VOUCHER)\b/.test(g)).length;
  const skipped = Math.max(0, opened - goodMain);
  const doc = parser.parseFromString(`<ENVELOPE>${good.join('\n')}</ENVELOPE>`, 'text/xml');
  return { doc, skipped: Math.max(skipped, found - good.length), damaged: true };
}

function buildFlags(stock: TallyStockItem[], ledgers: TallyLedger[]): ImportFlag[] {
  const flags: ImportFlag[] = [];
  stock.forEach(i => {
    const missing: string[] = [];
    if (!i.hsnCode) missing.push('HSN');
    if (!(i.gstRate > 0)) missing.push('GST rate');
    if (!(i.retailPrice > 0)) missing.push('Selling price');
    if (i.openingQty > 0 && !(i.costPrice > 0)) missing.push('Cost price');
    if (i.gstRate === 28 || i.gstRate === 12) missing.push(`Old ${i.gstRate}% slab: review`);
    if (missing.length) flags.push({ kind: 'item', name: i.name, missing });
  });
  ledgers.forEach(l => {
    if (l.ledgerType === 'SUNDRY_DEBTOR') {
      if (/^cash sales/i.test(l.name)) return;
      const missing: string[] = [];
      if (!l.phone) missing.push('Mobile');
      if (!l.address) missing.push('Address');
      if (!l.pincode) missing.push('Pincode');
      if (!l.stateName) missing.push('State');
      if (missing.length) flags.push({ kind: 'customer', name: l.name, missing });
    } else if (l.ledgerType === 'SUNDRY_CREDITOR') {
      const missing: string[] = [];
      if (!l.gstin) missing.push('GSTIN');
      if (!l.phone) missing.push('Mobile');
      if (!l.address) missing.push('Address');
      if (missing.length) flags.push({ kind: 'supplier', name: l.name, missing });
    }
  });
  return flags;
}

/** Plain CSV of everything that needs details, so it can be shared or worked through offline. */
export function missingDetailsToCsv(flags: ImportFlag[]): string {
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = flags.map(f => [f.kind === 'item' ? 'Item' : f.kind === 'customer' ? 'Customer' : 'Supplier', f.name, f.missing.join('; ')].map(q).join(','));
  return ['Type,Name,Missing', ...rows].join('\r\n');
}

// Parse Tally XML (TallyPrime / Tally ERP 9)
export function parseTallyXml(xmlString: string): TallyParseResult {
  const stockItems: TallyStockItem[] = [];
  const ledgers: TallyLedger[] = [];
  const vouchers: TallyVoucher[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const tolerant = parseXmlTolerant(xmlString);
  const xmlDoc = tolerant.doc;
  if (tolerant.damaged) {
    warnings.push(
      tolerant.skipped > 0
        ? `This file is damaged in places. ${tolerant.skipped} record(s) could not be read and were skipped; everything else was imported. Re-export from Tally if those are needed.`
        : 'This file had formatting problems that were repaired automatically.'
    );
  }

  const resolveGroup = buildGroupResolver(xmlDoc);
  let noSellingPrice = 0;
  let noHsn = 0;

  // 1. Stock items ------------------------------------------------------------------------
  const stockNodes = xmlDoc.getElementsByTagName('STOCKITEM');
  for (let idx = 0; idx < stockNodes.length; idx++) {
    const node = stockNodes[idx];
    try {
      if (kidText(node, 'ISDELETED') === 'Yes') continue;
      const name = (node.getAttribute('NAME') || '').trim();
      if (!name) continue;

      const parentGroup = kidText(node, 'PARENT');
      const uom = cleanLabel(kidText(node, 'BASEUNITS')) || 'Pcs';

      // HSN: latest HSNDETAILS.LIST entry that actually has a code
      const hsnEntry = lastWith(kids(node, 'HSNDETAILS.LIST'), 'HSNCODE');
      let hsnCode = hsnEntry ? kidText(hsnEntry, 'HSNCODE') : kidText(node, 'HSNCODE');
      if (!hsnCode) {
        noHsn++;
        hsnCode = '';
      }

      // GST rate: IGST rate in the latest GST details block (CGST x 2 as a fallback)
      let gstRate = 0;
      const gstBlocks = kids(node, 'GSTDETAILS.LIST');
      for (let g = gstBlocks.length - 1; g >= 0 && !gstRate; g--) {
        kids(gstBlocks[g], 'STATEWISEDETAILS.LIST').forEach(sw => {
          const rates = kids(sw, 'RATEDETAILS.LIST');
          const igst = rates.find(r => kidText(r, 'GSTRATEDUTYHEAD') === 'IGST');
          const cgst = rates.find(r => kidText(r, 'GSTRATEDUTYHEAD') === 'CGST');
          const v = igst ? num(kidText(igst, 'GSTRATE')) : cgst ? num(kidText(cgst, 'GSTRATE')) * 2 : 0;
          if (v > 0 && !gstRate) gstRate = v;
        });
      }
      if (!gstRate) gstRate = num(kidText(node, 'GSTREPORTRATE')) || 0;

      // Opening stock (value is negative in Tally exports, so use absolute numbers)
      const openingQty = Math.abs(num(kidText(node, 'OPENINGBALANCE')));
      const openingRate = Math.abs(num(kidText(node, 'OPENINGRATE')));
      const openingValue = Math.abs(num(kidText(node, 'OPENINGVALUE'))) || openingQty * openingRate;
      let costPrice = openingRate;
      if (costPrice <= 0 && openingQty > 0 && openingValue > 0) costPrice = Math.round((openingValue / openingQty) * 100) / 100;

      // Selling price from the latest standard price list, when Tally has one
      let retailPrice = 0;
      const priceLists = kids(node, 'STANDARDPRICELIST.LIST');
      for (let i = priceLists.length - 1; i >= 0 && !retailPrice; i--) retailPrice = Math.abs(num(kidText(priceLists[i], 'RATE')));
      if (retailPrice <= 0) {
        noSellingPrice++;
        retailPrice = 0; // Tally has no selling price: leave blank and flag it, never invent one
      }

      const partNo = kidText(node, 'PARTNO') || undefined;
      stockItems.push({
        name,
        parentGroup,
        hsnCode,
        gstRate,
        openingQty,
        openingRate: costPrice,
        openingValue,
        uom,
        partNo,
        costPrice,
        retailPrice,
        mrp: retailPrice,
        brand: inferBrand(name),
        category: inferCategory(parentGroup, name),
        sku: partNo || `SKU-${name.replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase()}`,
      });
    } catch (err: any) {
      errors.push(`Error parsing stock item ${idx + 1}: ${err.message}`);
    }
  }
  if (noHsn > 0) warnings.push(`${noHsn} stock items have no HSN code in Tally. Add them in the Products screen.`);
  if (noSellingPrice > 0)
    warnings.push(`Selling price is not stored in Tally for ${noSellingPrice} items. It was left blank (not guessed): fill it in the Products screen.`);

  // 2. Ledgers ----------------------------------------------------------------------------
  const ledgerNodes = xmlDoc.getElementsByTagName('LEDGER');
  for (let idx = 0; idx < ledgerNodes.length; idx++) {
    const node = ledgerNodes[idx];
    try {
      if (kidText(node, 'ISDELETED') === 'Yes') continue;
      const name = (node.getAttribute('NAME') || '').trim();
      if (!name || name.toLowerCase() === 'profit & loss a/c') continue;

      const parentGroup = kidText(node, 'PARENT');
      const root = resolveGroup(parentGroup);
      let ledgerType: TallyLedger['ledgerType'] = 'OTHER';
      if (root === 'sundry debtors') ledgerType = 'SUNDRY_DEBTOR';
      else if (root === 'sundry creditors') ledgerType = 'SUNDRY_CREDITOR';
      else if (root === 'bank accounts') ledgerType = 'BANK';
      else if (root === 'cash-in-hand') ledgerType = 'CASH';
      else if (root === 'duties & taxes') ledgerType = 'DUTIES_TAXES';
      else if (root === 'sales accounts') ledgerType = 'SALES';
      else if (root === 'purchase accounts') ledgerType = 'PURCHASE';

      // GSTIN / state
      const reg = lastWith(kids(node, 'LEDGSTREGDETAILS.LIST'), 'GSTIN') || lastWith(kids(node, 'LEDGSTREGDETAILS.LIST'), 'PLACEOFSUPPLY');
      const gstin = ((reg ? kidText(reg, 'GSTIN') : '') || kidText(node, 'PARTYGSTIN')).toUpperCase();

      // Mailing details (address, pincode, state)
      const mails = kids(node, 'LEDMAILINGDETAILS.LIST');
      const mail = lastWith(mails, 'PINCODE') || lastWith(mails, 'STATE') || mails[mails.length - 1];
      const addrLines: string[] = [];
      if (mail) {
        kids(mail, 'ADDRESS.LIST').forEach(al => kids(al, 'ADDRESS').forEach(a => {
          const t = trimComma(txt(a));
          if (t) addrLines.push(t);
        }));
      } else {
        kids(node, 'ADDRESS.LIST').forEach(al => kids(al, 'ADDRESS').forEach(a => {
          const t = trimComma(txt(a));
          if (t) addrLines.push(t);
        }));
      }
      const pincode = (mail ? kidText(mail, 'PINCODE') : kidText(node, 'PINCODE')).replace(/\D/g, '').slice(0, 6);
      const stateName =
        (mail ? kidText(mail, 'STATE') : '') ||
        (reg ? kidText(reg, 'PLACEOFSUPPLY') : '') ||
        cleanLabel(kidText(node, 'LEDSTATENAME')) ||
        kidText(node, 'PRIORSTATENAME') ||
        '';
      const gstCode = gstin.length >= 2 ? gstin.slice(0, 2) : '';
      const stateCode = gstCode || stateCodeFor(stateName);

      // City guess: the last address line when it is short (usually the town)
      let city = '';
      if (addrLines.length > 1) {
        const last = addrLines[addrLines.length - 1];
        if (last.split(' ').length <= 3 && !/\d/.test(last)) city = last;
      }
      const address = addrLines.join(', ');

      // Phone: only real numbers, never invented ones
      const phoneRaw = kidText(node, 'LEDGERMOBILE') || kidText(node, 'LEDGERPHONE') || kidText(node, 'LEDGERCONTACT') || kidText(node, 'MOBILENO');
      const contactBlocks = kids(node, 'CONTACTDETAILS.LIST');
      let contactPhone = '';
      contactBlocks.forEach(cb => {
        const v = kidText(cb, 'PHONENUMBER');
        if (v && !contactPhone) contactPhone = v;
      });
      const digits = (phoneRaw || contactPhone).replace(/\D/g, '');
      const phone = digits.length >= 10 ? digits.slice(-10) : '';

      const email = kidText(node, 'EMAIL') || kidText(node, 'LEDGEREMAIL') || undefined;

      // Opening balance: Tally XML stores debit balances as negative numbers
      const openRaw = kidText(node, 'OPENINGBALANCE');
      const openNum = num(openRaw);
      const isCredit = /Cr/i.test(openRaw) ? true : /Dr/i.test(openRaw) ? false : openNum > 0;

      const creditPeriodDays = num(kidText(node, 'BILLCREDITPERIOD')) || 0;
      const creditLimit = Math.abs(num(kidText(node, 'CREDITLIMIT'))) || undefined;

      ledgers.push({
        name,
        parentGroup,
        ledgerType,
        gstin: gstin || undefined,
        stateName,
        stateCode,
        pincode,
        address,
        city,
        phone,
        email,
        openingBalance: Math.abs(openNum),
        balanceType: isCredit ? 'Cr' : 'Dr',
        creditPeriodDays,
        creditLimit,
      });
    } catch (err: any) {
      errors.push(`Error parsing ledger ${idx + 1}: ${err.message}`);
    }
  }

  // 3. Vouchers (Day Book / sales register export) ------------------------------------------
  const voucherNodes = xmlDoc.getElementsByTagName('VOUCHER');
  for (let idx = 0; idx < voucherNodes.length; idx++) {
    const node = voucherNodes[idx];
    try {
      const voucherType = (node.getAttribute('VCHTYPE') || kidText(node, 'VOUCHERTYPENAME') || 'Sales').trim();
      const voucherNo = kidText(node, 'VOUCHERNUMBER') || `VCH-${idx + 1}`;
      const date = tallyDate(kidText(node, 'DATE'));
      const partyName = kidText(node, 'PARTYLEDGERNAME') || kidText(node, 'PARTYNAME') || kidText(node, 'BASICBUYERNAME') || 'Cash Customer';
      const isCancelled = kidText(node, 'ISCANCELLED') === 'Yes' || kidText(node, 'ISOPTIONAL') === 'Yes';

      // Ledger entries: party = grand total, tax ledgers = CGST / SGST / IGST, round-off ledger
      const entries = [...kids(node, 'ALLLEDGERENTRIES.LIST'), ...kids(node, 'LEDGERENTRIES.LIST')];
      let amount = 0;
      let cgst = 0;
      let sgst = 0;
      let igst = 0;
      let roundOff = 0;
      entries.forEach(le => {
        const lname = kidText(le, 'LEDGERNAME');
        const up = lname.toUpperCase();
        const amt = num(kidText(le, 'AMOUNT'));
        const isParty = kidText(le, 'ISPARTYLEDGER') === 'Yes' || lname.toLowerCase() === partyName.toLowerCase();
        if (isParty) amount = Math.max(amount, Math.abs(amt));
        else if (up.includes('ROUND')) roundOff += amt; // sign already says it: + rounded up (credit), - rounded down (debit)
        else if (up.includes('IGST')) igst += Math.abs(amt);
        else if (up.includes('CGST')) cgst += Math.abs(amt);
        else if (up.includes('SGST') || up.includes('UTGST')) sgst += Math.abs(amt);
      });

      const items: TallyVoucher['items'] = [];
      let taxable = 0;
      [...kids(node, 'ALLINVENTORYENTRIES.LIST'), ...kids(node, 'INVENTORYENTRIES.LIST')].forEach(it => {
        const itemName = kidText(it, 'STOCKITEMNAME');
        if (!itemName) return;
        const qtyText = kidText(it, 'BILLEDQTY') || kidText(it, 'ACTUALQTY');
        const qty = Math.abs(num(qtyText)) || 0;
        const unitMatch = qtyText.replace(/[\d.,\s-]/g, '');
        const rate = Math.abs(num(kidText(it, 'RATE')));
        const lineAmount = Math.abs(num(kidText(it, 'AMOUNT'))) || qty * rate;
        taxable += lineAmount;
        // Line GST rate when Tally includes it (RATEDETAILS.LIST per inventory line)
        const lineRates = kids(it, 'RATEDETAILS.LIST');
        const lIgst = lineRates.find(r => kidText(r, 'GSTRATEDUTYHEAD') === 'IGST');
        const lCgst = lineRates.find(r => kidText(r, 'GSTRATEDUTYHEAD') === 'CGST');
        const lineGst = lIgst ? num(kidText(lIgst, 'GSTRATE')) : lCgst ? num(kidText(lCgst, 'GSTRATE')) * 2 : undefined;
        items.push({
          name: itemName,
          qty,
          unit: unitMatch || 'Pcs',
          rate: rate || (qty ? lineAmount / qty : 0),
          amount: lineAmount,
          gstPercent: lineGst && lineGst > 0 ? lineGst : undefined,
        });
      });

      if (!amount) amount = taxable + cgst + sgst + igst + roundOff;

      const addrNode = kid(node, 'BASICBUYERADDRESS.LIST') || kid(node, 'ADDRESS.LIST');
      const buyerAddress = addrNode ? kids(addrNode, 'BASICBUYERADDRESS').concat(kids(addrNode, 'ADDRESS')).map(a => trimComma(txt(a))).filter(Boolean).join(', ') : '';

      vouchers.push({
        voucherType,
        voucherNo,
        date,
        partyName,
        amount,
        narration: kidText(node, 'NARRATION') || undefined,
        guid: kidText(node, 'GUID') || undefined,
        partyGstin: kidText(node, 'PARTYGSTIN') || undefined,
        placeOfSupply: kidText(node, 'PLACEOFSUPPLY') || kidText(node, 'STATENAME') || undefined,
        buyerAddress: buyerAddress || undefined,
        buyerPincode: (kidText(node, 'PARTYPINCODE') || kidText(node, 'CONSIGNEEPINNUMBER')).replace(/\D/g, '').slice(0, 6) || undefined,
        cgst,
        sgst,
        igst,
        roundOff,
        taxable,
        isCancelled,
        items,
      });
    } catch (err: any) {
      errors.push(`Error parsing voucher ${idx + 1}: ${err.message}`);
    }
  }

  const salesVouchers = vouchers.filter(v => /sales/i.test(v.voucherType) && !/order|return|credit/i.test(v.voucherType)).length;
  if (stockItems.length === 0 && ledgers.length === 0 && vouchers.length === 0) {
    warnings.push('No stock items, ledgers or vouchers were found in this file.');
  }
  if (vouchers.length === 0) {
    warnings.push('This file has no vouchers (it is a masters-only export). To bring in old orders, export the Day Book / Sales Register from Tally as XML.');
  }

  const totalDebtors = ledgers.filter(l => l.ledgerType === 'SUNDRY_DEBTOR').length;
  const totalCreditors = ledgers.filter(l => l.ledgerType === 'SUNDRY_CREDITOR').length;

  return {
    fileType: 'XML',
    stockItems,
    ledgers,
    vouchers,
    errors,
    warnings,
    flags: buildFlags(stockItems, ledgers),
    summary: {
      totalStockItems: stockItems.length,
      totalDebtors,
      totalCreditors,
      totalVouchers: salesVouchers || vouchers.length,
      rawElementCount: stockNodes.length + ledgerNodes.length + voucherNodes.length,
    },
  };
}

// Parse Tally Excel / CSV Export Text
export function parseTallyCsv(csvString: string): TallyParseResult {
  const stockItems: TallyStockItem[] = [];
  const ledgers: TallyLedger[] = [];
  const vouchers: TallyVoucher[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  const lines = csvString.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) {
    return {
      fileType: 'CSV',
      stockItems: [],
      ledgers: [],
      vouchers: [],
      errors: ['File is empty or contains only 1 line.'],
      warnings: [],
      summary: { totalStockItems: 0, totalDebtors: 0, totalCreditors: 0, totalVouchers: 0, rawElementCount: 0 },
    };
  }

  // Parse CSV Line respecting quotes
  const parseLine = (line: string): string[] => {
    const res: string[] = [];
    let insideQuotes = false;
    let curr = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        curr += '"';
        i++;
      } else if (ch === '"') {
        insideQuotes = !insideQuotes;
      } else if ((ch === ',' || ch === '\t') && !insideQuotes) {
        res.push(curr.trim());
        curr = '';
      } else {
        curr += ch;
      }
    }
    res.push(curr.trim());
    return res;
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

  // Detect whether this CSV is Stock Item Master or Ledger Master
  const isStockCsv = headers.some(h => h.includes('item') || h.includes('stock') || h.includes('hsn') || h.includes('closingqty') || h.includes('openingqty'));
  const isLedgerCsv = headers.some(h => h.includes('party') || h.includes('debtor') || h.includes('creditor') || h.includes('ledger') || h.includes('gstin'));

  lines.slice(1).forEach((line, idx) => {
    const cols = parseLine(line);
    if (cols.length === 0 || cols.every(c => c === '')) return;

    const getCol = (possibleKeywords: string[]): string => {
      for (let i = 0; i < headers.length; i++) {
        if (possibleKeywords.some(k => headers[i].includes(k))) {
          return cols[i] || '';
        }
      }
      return '';
    };

    if (isStockCsv || (!isLedgerCsv && cols.length >= 3)) {
      const name = getCol(['item', 'particulars', 'name', 'description']) || `Stock Item ${idx + 1}`;
      const parentGroup = getCol(['group', 'parent', 'category']) || '';
      let hsnCode = getCol(['hsn', 'sac']) || '';
      const gstRate = cleanTallyNumber(getCol(['gst', 'tax', 'rate', 'igst'])) || 0;
      const openingQty = cleanTallyNumber(getCol(['open', 'stock', 'qty', 'balance', 'closing']));
      const costPrice = cleanTallyNumber(getCol(['cost', 'rate', 'purchase', 'inward'])) || 0;
      let retailPrice = cleanTallyNumber(getCol(['retail', 'price', 'selling', 'mrp']));
      // no selling price in the file: leave it blank (flagged), never invent one
      const mrp = retailPrice;
      const uom = getCol(['uom', 'unit']) || 'NOS';
      const partNo = getCol(['part', 'sku', 'code']);

      stockItems.push({
        name,
        parentGroup,
        hsnCode,
        gstRate,
        openingQty,
        openingRate: costPrice,
        openingValue: openingQty * costPrice,
        uom,
        partNo: partNo || undefined,
        costPrice,
        retailPrice,
        mrp,
        brand: inferBrand(name),
        category: inferCategory(parentGroup, name),
        sku: partNo || `SKU-${name.replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase()}`,
      });
    }

    if (isLedgerCsv || (!isStockCsv && cols.length >= 4)) {
      const name = getCol(['party', 'ledger', 'particulars', 'customer', 'supplier', 'name']) || `Party ${idx + 1}`;
      const parentGroup = getCol(['group', 'parent', 'under']) || 'Sundry Debtors';
      const parentLower = parentGroup.toLowerCase();

      let ledgerType: TallyLedger['ledgerType'] = 'SUNDRY_DEBTOR';
      if (parentLower.includes('creditor') || parentLower.includes('supplier')) {
        ledgerType = 'SUNDRY_CREDITOR';
      }

      const gstin = (getCol(['gstin', 'uin', 'gst']) || '').toUpperCase();
      const stateName = getCol(['state']) || 'Gujarat';
      const stateCode = gstin && gstin.length >= 2 ? gstin.slice(0, 2) : '24';
      const pincode = getCol(['pincode', 'pin', 'zip']).replace(/\D/g, '').slice(0, 6);
      const address = getCol(['address', 'location']);
      
      const rawPhone = getCol(['phone', 'mobile', 'contact']);
      const phoneDigits = rawPhone.replace(/\D/g, '');
      const phone = phoneDigits.length >= 10 ? phoneDigits.slice(-10) : '';
      
      const email = getCol(['email']) || undefined;
      const openBal = cleanTallyNumber(getCol(['balance', 'opening', 'amount']));
      const creditDays = cleanTallyNumber(getCol(['credit', 'days', 'period'])) || 0;

      ledgers.push({
        name,
        parentGroup,
        ledgerType,
        gstin: gstin || undefined,
        stateName,
        stateCode,
        pincode,
        address,
        phone,
        email,
        openingBalance: openBal,
        balanceType: 'Dr',
        creditPeriodDays: creditDays,
        creditLimit: undefined,
      });
    }
  });

  const totalDebtors = ledgers.filter(l => l.ledgerType === 'SUNDRY_DEBTOR').length;
  const totalCreditors = ledgers.filter(l => l.ledgerType === 'SUNDRY_CREDITOR').length;

  return {
    fileType: 'CSV',
    stockItems,
    ledgers,
    vouchers,
    errors,
    warnings,
    summary: {
      totalStockItems: stockItems.length,
      totalDebtors,
      totalCreditors,
      totalVouchers: 0,
      rawElementCount: lines.length - 1,
    },
  };
}

// Master Parser: Auto-detects whether rawText is XML or CSV/Excel
export function parseTallyData(rawText: string): TallyParseResult {
  const trimmed = rawText.replace(/^\uFEFF/, '').trim();
  if (trimmed.startsWith('<') || trimmed.includes('<ENVELOPE>') || trimmed.includes('<TALLYMESSAGE')) {
    return parseTallyXml(trimmed);
  }
  return parseTallyCsv(trimmed);
}

// Real-world sample Tally XML for instant 1-click test
export function getSampleTallyXml(): string {
  return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <!-- Stock Items Masters (Tyres, Tubes & Batteries) -->
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <STOCKITEM NAME="MRF ZVTV 185/65 R15 88H Tubeless" ACTION="Create">
            <PARENT>Passenger Car Tyres</PARENT>
            <BASEUNITS>NOS</BASEUNITS>
            <PARTNO>MRF-ZVTV-1856515</PARTNO>
            <HSNCODE>40111010</HSNCODE>
            <GSTREPORTRATE>28.00</GSTREPORTRATE>
            <OPENINGBALANCE>48.00 NOS</OPENINGBALANCE>
            <OPENINGRATE>3850.00/NOS</OPENINGRATE>
            <OPENINGVALUE>184800.00</OPENINGVALUE>
            <STANDARDPRICE>4400.00</STANDARDPRICE>
          </STOCKITEM>
        </TALLYMESSAGE>

        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <STOCKITEM NAME="Apollo Alnac 4G 195/65 R15 91V Tubeless" ACTION="Create">
            <PARENT>Passenger Car Tyres</PARENT>
            <BASEUNITS>NOS</BASEUNITS>
            <PARTNO>APO-ALN-1956515</PARTNO>
            <HSNCODE>40111010</HSNCODE>
            <GSTREPORTRATE>28.00</GSTREPORTRATE>
            <OPENINGBALANCE>36.00 NOS</OPENINGBALANCE>
            <OPENINGRATE>4200.00/NOS</OPENINGRATE>
            <OPENINGVALUE>151200.00</OPENINGVALUE>
            <STANDARDPRICE>4850.00</STANDARDPRICE>
          </STOCKITEM>
        </TALLYMESSAGE>

        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <STOCKITEM NAME="CEAT Secura Zoom F 90/90-17 49P Tubeless" ACTION="Create">
            <PARENT>Two-Wheeler &amp; Motorcycle Tyres</PARENT>
            <BASEUNITS>NOS</BASEUNITS>
            <PARTNO>CEAT-SEC-909017</PARTNO>
            <HSNCODE>40114010</HSNCODE>
            <GSTREPORTRATE>28.00</GSTREPORTRATE>
            <OPENINGBALANCE>60.00 NOS</OPENINGBALANCE>
            <OPENINGRATE>1450.00/NOS</OPENINGRATE>
            <OPENINGVALUE>87000.00</OPENINGVALUE>
            <STANDARDPRICE>1850.00</STANDARDPRICE>
          </STOCKITEM>
        </TALLYMESSAGE>

        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <STOCKITEM NAME="Exide Mileage ML38B20R Car Battery (35Ah)" ACTION="Create">
            <PARENT>Automotive Batteries</PARENT>
            <BASEUNITS>NOS</BASEUNITS>
            <PARTNO>EXD-ML38B20R</PARTNO>
            <HSNCODE>85071000</HSNCODE>
            <GSTREPORTRATE>28.00</GSTREPORTRATE>
            <OPENINGBALANCE>24.00 NOS</OPENINGBALANCE>
            <OPENINGRATE>3400.00/NOS</OPENINGRATE>
            <OPENINGVALUE>81600.00</OPENINGVALUE>
            <STANDARDPRICE>4200.00</STANDARDPRICE>
          </STOCKITEM>
        </TALLYMESSAGE>

        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <STOCKITEM NAME="Bridgestone Ecopia EP150 205/65 R16 Tubeless" ACTION="Create">
            <PARENT>Passenger Car Tyres</PARENT>
            <BASEUNITS>NOS</BASEUNITS>
            <PARTNO>BRDG-ECO-2056516</PARTNO>
            <HSNCODE>40111010</HSNCODE>
            <GSTREPORTRATE>28.00</GSTREPORTRATE>
            <OPENINGBALANCE>20.00 NOS</OPENINGBALANCE>
            <OPENINGRATE>6200.00/NOS</OPENINGRATE>
            <OPENINGVALUE>124000.00</OPENINGVALUE>
            <STANDARDPRICE>7100.00</STANDARDPRICE>
          </STOCKITEM>
        </TALLYMESSAGE>

        <!-- Customer Ledgers (Sundry Debtors) -->
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="Gujarat Fleet Logistics Pvt Ltd" ACTION="Create">
            <PARENT>Sundry Debtors</PARENT>
            <PARTYGSTIN>24AABCG1234F1Z8</PARTYGSTIN>
            <LEDSTATENAME>Gujarat</LEDSTATENAME>
            <PINCODE>395006</PINCODE>
            <ADDRESS.LIST>
              <ADDRESS>Plot 42, GIDC Sachin Industrial Area</ADDRESS>
              <ADDRESS>Surat, Gujarat</ADDRESS>
            </ADDRESS.LIST>
            <LEDGERMOBILE>9879101234</LEDGERMOBILE>
            <EMAIL>accounts@gujaratfleet.in</EMAIL>
            <OPENINGBALANCE>45000.00 Dr</OPENINGBALANCE>
            <BILLCREDITPERIOD>45 Days</BILLCREDITPERIOD>
            <CREDITLIMIT>500000.00</CREDITLIMIT>
          </LEDGER>
        </TALLYMESSAGE>

        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="Surat Royal Auto Spares &amp; Tyres" ACTION="Create">
            <PARENT>Sundry Debtors</PARENT>
            <PARTYGSTIN>24BBPPR5678K1Z2</PARTYGSTIN>
            <LEDSTATENAME>Gujarat</LEDSTATENAME>
            <PINCODE>395002</PINCODE>
            <ADDRESS.LIST>
              <ADDRESS>Shop 12-14, Auto Market, Ring Road</ADDRESS>
              <ADDRESS>Surat, Gujarat</ADDRESS>
            </ADDRESS.LIST>
            <LEDGERMOBILE>9825123456</LEDGERMOBILE>
            <EMAIL>suratroyalauto@gmail.com</EMAIL>
            <OPENINGBALANCE>28500.00 Dr</OPENINGBALANCE>
            <BILLCREDITPERIOD>30 Days</BILLCREDITPERIOD>
            <CREDITLIMIT>300000.00</CREDITLIMIT>
          </LEDGER>
        </TALLYMESSAGE>

        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="Patel Cab Services &amp; Tours" ACTION="Create">
            <PARENT>Sundry Debtors</PARENT>
            <PARTYGSTIN>24AAJFP9988D1Z4</PARTYGSTIN>
            <LEDSTATENAME>Gujarat</LEDSTATENAME>
            <PINCODE>395007</PINCODE>
            <ADDRESS.LIST>
              <ADDRESS>Near Airport Road, Vesu</ADDRESS>
              <ADDRESS>Surat, Gujarat</ADDRESS>
            </ADDRESS.LIST>
            <LEDGERMOBILE>9898234567</LEDGERMOBILE>
            <EMAIL>patelcabsurat@yahoo.com</EMAIL>
            <OPENINGBALANCE>12400.00 Dr</OPENINGBALANCE>
            <BILLCREDITPERIOD>30 Days</BILLCREDITPERIOD>
            <CREDITLIMIT>200000.00</CREDITLIMIT>
          </LEDGER>
        </TALLYMESSAGE>

        <!-- Supplier Ledgers (Sundry Creditors) -->
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="MRF Tyres Regional Depot" ACTION="Create">
            <PARENT>Sundry Creditors</PARENT>
            <PARTYGSTIN>24AAACM1122C1Z9</PARTYGSTIN>
            <LEDSTATENAME>Gujarat</LEDSTATENAME>
            <PINCODE>380015</PINCODE>
            <ADDRESS.LIST>
              <ADDRESS>Highway Logistics Park, SG Highway</ADDRESS>
              <ADDRESS>Ahmedabad, Gujarat</ADDRESS>
            </ADDRESS.LIST>
            <LEDGERMOBILE>9879555666</LEDGERMOBILE>
            <EMAIL>depot.ahmedabad@mrftyres.com</EMAIL>
            <OPENINGBALANCE>180000.00 Cr</OPENINGBALANCE>
            <BILLCREDITPERIOD>30 Days</BILLCREDITPERIOD>
          </LEDGER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

// Two-way sync (app -> Tally) lives in tallyExport.ts
export { generateTallyVouchersXml } from './tallyExport';
