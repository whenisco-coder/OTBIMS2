/**
 * App -> Tally export.
 *
 * Builds XML that TallyPrime / Tally ERP 9 can import (Gateway of Tally > Import > Data).
 * Two files are produced:
 *   1. Masters (only the ledgers / stock items that do not exist in Tally yet)
 *   2. Sales vouchers (one per order, with items, GST ledgers and round off)
 *
 * Sign convention used by Tally XML: debit entries (the customer) are ISDEEMEDPOSITIVE=Yes with a NEGATIVE
 * amount, credit entries (sales, GST, round off up) are ISDEEMEDPOSITIVE=No with a POSITIVE amount.
 */

import type { Order, Customer, Product } from '../types';

export interface TallyLedgerPair {
  local: string; // Gujarat (CGST + SGST) sales
  inter: string; // other state (IGST) sales
}

export interface TallyExportConfig {
  voucherType: string;
  sales: Record<string, TallyLedgerPair>; // key = GST rate, e.g. "18"
  cgst: Record<string, string>;
  sgst: Record<string, string>;
  igst: Record<string, string>;
  fallbackSales: TallyLedgerPair;
  fallbackCgst: string;
  fallbackSgst: string;
  fallbackIgst: string;
  roundOffLedger: string;
  godown: string;
  batch: string;
}

/** Defaults taken from the ledger names found in the Tally company that was shared (Sales @18, Out IGST @18 ...). */
export const DEFAULT_TALLY_CONFIG: TallyExportConfig = {
  voucherType: 'Sales',
  sales: {
    '5': { local: 'Sales @5 Local', inter: 'Sales @5 Inter State' },
    '18': { local: 'Sales @18', inter: 'Sales @18' },
    '28': { local: 'Sales @ 28', inter: 'Sales @ 28' },
  },
  cgst: { '5': 'Out CGST %2.5', '18': 'Output CGST @9', '28': 'Output CGST @ 14' },
  sgst: { '5': 'Out SGST %2.5', '18': 'Output SGST @9', '28': 'Output SGST @ 14' },
  igst: { '5': 'OUTPUT IGST @5', '18': 'Out IGST @18', '28': 'IGST OUTPUT' },
  fallbackSales: { local: 'SALES', inter: 'SALES' },
  fallbackCgst: 'CGST OUTPUT',
  fallbackSgst: 'SGST OUTPUT',
  fallbackIgst: 'IGST OUTPUT',
  roundOffLedger: 'Round Off',
  godown: 'Main Location',
  batch: 'Primary Batch',
};

const CONFIG_KEY = 'tb-tally-config';
const KNOWN_KEY = 'tb-tally-known';

export interface TallyKnownNames {
  ledgers: string[];
  stockItems: string[];
}

export function loadTallyConfig(): TallyExportConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return { ...DEFAULT_TALLY_CONFIG, ...JSON.parse(raw) };
  } catch {
    /* use defaults */
  }
  return DEFAULT_TALLY_CONFIG;
}

export function saveTallyConfig(cfg: TallyExportConfig) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

export function loadKnownTallyNames(): TallyKnownNames {
  try {
    const raw = localStorage.getItem(KNOWN_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return { ledgers: p.ledgers || [], stockItems: p.stockItems || [] };
    }
  } catch {
    /* ignore */
  }
  return { ledgers: [], stockItems: [] };
}

/** Remember what already exists in Tally (called after a Tally masters file is read). */
export function saveKnownTallyNames(names: TallyKnownNames) {
  try {
    localStorage.setItem(KNOWN_KEY, JSON.stringify(names));
  } catch {
    /* ignore */
  }
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => r2(n).toFixed(2);
const tallyDate = (d: string) => d.replace(/-/g, '').slice(0, 8);

function pick<T>(map: Record<string, T>, rate: number, fallback: T): T {
  return map[String(rate)] ?? fallback;
}

function salesLedgerFor(cfg: TallyExportConfig, rate: number, intra: boolean): string {
  const pair = pick(cfg.sales, rate, cfg.fallbackSales);
  return intra ? pair.local : pair.inter;
}

interface VoucherPlan {
  order: Order;
  intra: boolean;
  groups: Array<{ rate: number; taxable: number; cgst: number; sgst: number; igst: number; salesLedger: string }>;
  roundOff: number;
  total: number;
}

function planVoucher(order: Order, cfg: TallyExportConfig): VoucherPlan {
  const intra = !!order.isGujarat;
  const byRate = new Map<number, { taxable: number; cgst: number; sgst: number; igst: number }>();
  order.items.forEach(it => {
    const cur = byRate.get(it.gstPercent) || { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    cur.taxable += it.taxableAmount;
    cur.cgst += it.cgstAmount;
    cur.sgst += it.sgstAmount;
    cur.igst += it.igstAmount;
    byRate.set(it.gstPercent, cur);
  });
  const groups = Array.from(byRate.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([rate, v]) => ({
      rate,
      taxable: r2(v.taxable),
      cgst: r2(v.cgst),
      sgst: r2(v.sgst),
      igst: r2(v.igst),
      salesLedger: salesLedgerFor(cfg, rate, intra),
    }));
  const raw = groups.reduce((s, g) => s + g.taxable + g.cgst + g.sgst + g.igst, 0);
  const roundOff = r2(order.grandTotal - raw);
  // Party total is derived from the lines so the voucher always balances to the paisa
  const total = r2(raw + (Math.abs(roundOff) < 1 ? roundOff : 0));
  return { order, intra, groups, roundOff: Math.abs(roundOff) < 1 ? roundOff : 0, total };
}

function addressLinesXml(order: Order): string {
  const a = order.billingAddress || order.shippingAddress;
  const lines = [a?.addressLine, [a?.city, a?.pincode].filter(Boolean).join(' - ')].filter(Boolean) as string[];
  return lines.map(l => `<BASICBUYERADDRESS>${esc(l)}</BASICBUYERADDRESS>`).join('');
}

export interface TallyExportResult {
  xml: string;
  voucherCount: number;
  missingLedgers: string[]; // ledger names the vouchers use that Tally does not have yet (per last Master.xml read)
  missingItems: string[];
}

export function generateTallyVouchersXml(
  orders: Order[],
  _settings: { businessName: string; gstin: string },
  cfg: TallyExportConfig = DEFAULT_TALLY_CONFIG
): string {
  return buildTallyVouchers(orders, cfg).xml;
}

export function buildTallyVouchers(
  orders: Order[],
  cfg: TallyExportConfig,
  known: TallyKnownNames = { ledgers: [], stockItems: [] }
): TallyExportResult {
  const knownLedgers = new Set(known.ledgers.map(n => n.trim().toLowerCase()));
  const knownItems = new Set(known.stockItems.map(n => n.trim().toLowerCase()));
  const missingLedgers = new Set<string>();
  const missingItems = new Set<string>();
  const needLedger = (name: string) => {
    if (known.ledgers.length > 0 && !knownLedgers.has(name.trim().toLowerCase())) missingLedgers.add(name);
  };

  const body = orders
    .map(order => {
      const plan = planVoucher(order, cfg);
      const date = tallyDate(order.orderDate);
      const voucherNo = order.invoiceNo || order.orderNo;
      const party = order.customerName;
      needLedger(party);
      const state = (order.billingAddress || order.shippingAddress)?.state || '';

      const inventory = order.items
        .map(it => {
          const ledger = salesLedgerFor(cfg, it.gstPercent, plan.intra);
          needLedger(ledger);
          if (known.stockItems.length > 0 && !knownItems.has(it.name.trim().toLowerCase())) missingItems.add(it.name);
          const rate = it.qty ? it.taxableAmount / it.qty : it.unitPrice;
          return `
     <ALLINVENTORYENTRIES.LIST>
      <STOCKITEMNAME>${esc(it.name)}</STOCKITEMNAME>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
      <RATE>${money(rate)}/Pcs</RATE>
      <AMOUNT>${money(it.taxableAmount)}</AMOUNT>
      <ACTUALQTY> ${it.qty} Pcs</ACTUALQTY>
      <BILLEDQTY> ${it.qty} Pcs</BILLEDQTY>
      <BATCHALLOCATIONS.LIST>
       <GODOWNNAME>${esc(cfg.godown)}</GODOWNNAME>
       <BATCHNAME>${esc(cfg.batch)}</BATCHNAME>
       <AMOUNT>${money(it.taxableAmount)}</AMOUNT>
       <ACTUALQTY> ${it.qty} Pcs</ACTUALQTY>
       <BILLEDQTY> ${it.qty} Pcs</BILLEDQTY>
      </BATCHALLOCATIONS.LIST>
      <RATEDETAILS.LIST><GSTRATEDUTYHEAD>CGST</GSTRATEDUTYHEAD><GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE><GSTRATE> ${it.gstPercent / 2}</GSTRATE></RATEDETAILS.LIST>
      <RATEDETAILS.LIST><GSTRATEDUTYHEAD>SGST/UTGST</GSTRATEDUTYHEAD><GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE><GSTRATE> ${it.gstPercent / 2}</GSTRATE></RATEDETAILS.LIST>
      <RATEDETAILS.LIST><GSTRATEDUTYHEAD>IGST</GSTRATEDUTYHEAD><GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE><GSTRATE> ${it.gstPercent}</GSTRATE></RATEDETAILS.LIST>
      <ACCOUNTINGALLOCATIONS.LIST>
       <LEDGERNAME>${esc(ledger)}</LEDGERNAME>
       <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
       <AMOUNT>${money(it.taxableAmount)}</AMOUNT>
      </ACCOUNTINGALLOCATIONS.LIST>
     </ALLINVENTORYENTRIES.LIST>`;
        })
        .join('');

      const taxEntries = plan.groups
        .map(g => {
          const lines: Array<[string, number]> = plan.intra
            ? [
                [pick(cfg.cgst, g.rate, cfg.fallbackCgst), g.cgst],
                [pick(cfg.sgst, g.rate, cfg.fallbackSgst), g.sgst],
              ]
            : [[pick(cfg.igst, g.rate, cfg.fallbackIgst), g.igst]];
          return lines
            .filter(([, amt]) => amt !== 0)
            .map(([name, amt]) => {
              needLedger(name);
              return `
     <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>${esc(name)}</LEDGERNAME>
      <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
      <AMOUNT>${money(amt)}</AMOUNT>
     </ALLLEDGERENTRIES.LIST>`;
            })
            .join('');
        })
        .join('');

      let roundEntry = '';
      if (Math.abs(plan.roundOff) > 0.004) {
        needLedger(cfg.roundOffLedger);
        // rounding UP is a credit (positive); rounding DOWN is a debit (negative, deemed positive)
        const up = plan.roundOff > 0;
        roundEntry = `
     <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>${esc(cfg.roundOffLedger)}</LEDGERNAME>
      <ISDEEMEDPOSITIVE>${up ? 'No' : 'Yes'}</ISDEEMEDPOSITIVE>
      <AMOUNT>${money(plan.roundOff)}</AMOUNT>
     </ALLLEDGERENTRIES.LIST>`;
      }

      return `
   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <VOUCHER VCHTYPE="${esc(cfg.voucherType)}" ACTION="Create" OBJVIEW="Invoice Voucher View">
     <DATE>${date}</DATE>
     <EFFECTIVEDATE>${date}</EFFECTIVEDATE>
     <VOUCHERTYPENAME>${esc(cfg.voucherType)}</VOUCHERTYPENAME>
     <VOUCHERNUMBER>${esc(voucherNo)}</VOUCHERNUMBER>
     <REFERENCE>${esc(order.orderNo)}</REFERENCE>
     <PARTYLEDGERNAME>${esc(party)}</PARTYLEDGERNAME>
     <PARTYNAME>${esc(party)}</PARTYNAME>
     <BASICBUYERNAME>${esc(party)}</BASICBUYERNAME>
     <PARTYGSTIN>${esc(order.customerGstin || '')}</PARTYGSTIN>
     <PLACEOFSUPPLY>${esc(state)}</PLACEOFSUPPLY>
     <GSTREGISTRATIONTYPE>${order.customerGstin ? 'Regular' : 'Unregistered'}</GSTREGISTRATIONTYPE>
     <BASICBUYERADDRESS.LIST TYPE="String">${addressLinesXml(order)}</BASICBUYERADDRESS.LIST>
     <NARRATION>Tyrebuddy ${esc(order.orderNo)}</NARRATION>
     <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
     <ISINVOICE>Yes</ISINVOICE>
     <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>${esc(party)}</LEDGERNAME>
      <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
      <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
      <AMOUNT>-${money(plan.total)}</AMOUNT>
      <BILLALLOCATIONS.LIST>
       <NAME>${esc(voucherNo)}</NAME>
       <BILLTYPE>New Ref</BILLTYPE>
       <AMOUNT>-${money(plan.total)}</AMOUNT>
      </BILLALLOCATIONS.LIST>
     </ALLLEDGERENTRIES.LIST>${inventory}${taxEntries}${roundEntry}
    </VOUCHER>
   </TALLYMESSAGE>`;
    })
    .join('');

  const xml = `<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>Vouchers</REPORTNAME>
   </REQUESTDESC>
   <REQUESTDATA>${body}
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;

  return { xml, voucherCount: orders.length, missingLedgers: Array.from(missingLedgers), missingItems: Array.from(missingItems) };
}

/** Masters file: creates only the party ledgers, GST/sales ledgers and stock items that Tally does not have yet. */
export function buildTallyMasters(
  orders: Order[],
  customers: Customer[],
  products: Product[],
  cfg: TallyExportConfig,
  known: TallyKnownNames
): { xml: string; ledgerCount: number; itemCount: number } {
  const knownLedgers = new Set(known.ledgers.map(n => n.trim().toLowerCase()));
  const knownItems = new Set(known.stockItems.map(n => n.trim().toLowerCase()));
  const parts: string[] = [];
  const doneLedgers = new Set<string>();
  const doneItems = new Set<string>();
  const from = '20200401';

  const ledgerXml = (name: string, parent: string, extra = '') => {
    const key = name.trim().toLowerCase();
    if (knownLedgers.has(key) || doneLedgers.has(key)) return;
    doneLedgers.add(key);
    parts.push(`
   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <LEDGER NAME="${esc(name)}" ACTION="Create">
     <PARENT>${esc(parent)}</PARENT>${extra}
    </LEDGER>
   </TALLYMESSAGE>`);
  };

  orders.forEach(order => {
    const plan = planVoucher(order, cfg);
    // customer ledger
    const cust = customers.find(c => c.id === order.customerId);
    const addr = order.billingAddress || order.shippingAddress;
    const gstin = order.customerGstin || cust?.gstin || '';
    ledgerXml(
      order.customerName,
      'Sundry Debtors',
      `
     <ISBILLWISEON>Yes</ISBILLWISEON>
     <LEDMAILINGDETAILS.LIST>
      <ADDRESS.LIST TYPE="String"><ADDRESS>${esc(addr?.addressLine || '')}</ADDRESS><ADDRESS>${esc(addr?.city || '')}</ADDRESS></ADDRESS.LIST>
      <APPLICABLEFROM>${from}</APPLICABLEFROM>
      <PINCODE>${esc(addr?.pincode || '')}</PINCODE>
      <MAILINGNAME>${esc(order.customerName)}</MAILINGNAME>
      <STATE>${esc(addr?.state || '')}</STATE>
      <COUNTRY>India</COUNTRY>
     </LEDMAILINGDETAILS.LIST>
     <LEDGSTREGDETAILS.LIST>
      <APPLICABLEFROM>${from}</APPLICABLEFROM>
      <GSTREGISTRATIONTYPE>${gstin ? 'Regular' : 'Unregistered'}</GSTREGISTRATIONTYPE>
      <PLACEOFSUPPLY>${esc(addr?.state || '')}</PLACEOFSUPPLY>
      ${gstin ? `<GSTIN>${esc(gstin)}</GSTIN>` : ''}
     </LEDGSTREGDETAILS.LIST>${order.customerPhone ? `\n     <LEDGERMOBILE>${esc(order.customerPhone)}</LEDGERMOBILE>` : ''}`
    );
    // sales + GST ledgers
    plan.groups.forEach(g => {
      ledgerXml(g.salesLedger, 'Sales Accounts');
      if (plan.intra) {
        ledgerXml(
          pick(cfg.cgst, g.rate, cfg.fallbackCgst),
          'Duties & Taxes',
          `\n     <TAXTYPE>GST</TAXTYPE>\n     <GSTDUTYHEAD>Central Tax</GSTDUTYHEAD>\n     <RATEOFTAXCALCULATION>${g.rate / 2}</RATEOFTAXCALCULATION>`
        );
        ledgerXml(
          pick(cfg.sgst, g.rate, cfg.fallbackSgst),
          'Duties & Taxes',
          `\n     <TAXTYPE>GST</TAXTYPE>\n     <GSTDUTYHEAD>State Tax</GSTDUTYHEAD>\n     <RATEOFTAXCALCULATION>${g.rate / 2}</RATEOFTAXCALCULATION>`
        );
      } else {
        ledgerXml(
          pick(cfg.igst, g.rate, cfg.fallbackIgst),
          'Duties & Taxes',
          `\n     <TAXTYPE>GST</TAXTYPE>\n     <GSTDUTYHEAD>Integrated Tax</GSTDUTYHEAD>\n     <RATEOFTAXCALCULATION>${g.rate}</RATEOFTAXCALCULATION>`
        );
      }
    });
    if (Math.abs(plan.roundOff) > 0.004) ledgerXml(cfg.roundOffLedger, 'Indirect Expenses');

    // stock items
    order.items.forEach(it => {
      const key = it.name.trim().toLowerCase();
      if (knownItems.has(key) || doneItems.has(key)) return;
      doneItems.add(key);
      const rates = it.gstPercent;
      const prod = products.find(p => p.id === it.productId);
      parts.push(`
   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <STOCKITEM NAME="${esc(it.name)}" ACTION="Create">
     <BASEUNITS>Pcs</BASEUNITS>
     <GSTAPPLICABLE>Applicable</GSTAPPLICABLE>
     <GSTDETAILS.LIST>
      <APPLICABLEFROM>${from}</APPLICABLEFROM>
      <CALCULATIONTYPE>On Value</CALCULATIONTYPE>
      <TAXABILITY>Taxable</TAXABILITY>
      <STATEWISEDETAILS.LIST>
       <STATENAME>Any</STATENAME>
       <RATEDETAILS.LIST><GSTRATEDUTYHEAD>CGST</GSTRATEDUTYHEAD><GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE><GSTRATE>${rates / 2}</GSTRATE></RATEDETAILS.LIST>
       <RATEDETAILS.LIST><GSTRATEDUTYHEAD>SGST/UTGST</GSTRATEDUTYHEAD><GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE><GSTRATE>${rates / 2}</GSTRATE></RATEDETAILS.LIST>
       <RATEDETAILS.LIST><GSTRATEDUTYHEAD>IGST</GSTRATEDUTYHEAD><GSTRATEVALUATIONTYPE>Based on Value</GSTRATEVALUATIONTYPE><GSTRATE>${rates}</GSTRATE></RATEDETAILS.LIST>
      </STATEWISEDETAILS.LIST>
     </GSTDETAILS.LIST>
     <HSNDETAILS.LIST>
      <APPLICABLEFROM>${from}</APPLICABLEFROM>
      <HSNCODE>${esc(it.hsn || prod?.hsn || '')}</HSNCODE>
      <SRCOFHSNDETAILS>Specify Details Here</SRCOFHSNDETAILS>
     </HSNDETAILS.LIST>
    </STOCKITEM>
   </TALLYMESSAGE>`);
    });
  });

  const xml = `<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>All Masters</REPORTNAME>
   </REQUESTDESC>
   <REQUESTDATA>${parts.join('')}
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;
  return { xml, ledgerCount: doneLedgers.size, itemCount: doneItems.size };
}
