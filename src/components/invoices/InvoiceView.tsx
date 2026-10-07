/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../../context/StoreContext';
import { Order, CreditNote } from '../../types';
import { generateQrDataUrl, buildUpiPayUri, getQrMatrix } from '../../utils/barcode';
import {
  InvoiceOptions,
  InvoiceModel,
  buildInvoiceModel,
  defaultInvoiceOptions,
  mergeInvoiceOptions,
  fmtMoney,
  DEFAULT_DECLARATION,
} from '../../utils/invoiceModel';
import { renderInvoicePdf } from '../../utils/invoicePdf';
import { downloadFile, openFileInTab, shareFile, isMobileDevice, inEmbeddedFrame } from '../../utils/export';
import { safePrint } from '../../utils/print';
import {
  Printer,
  ArrowLeft,
  RotateCcw,
  Check,
  Truck,
  FileDown,
  Share2,
  SlidersHorizontal,
  Eye,
  EyeOff,
} from 'lucide-react';

interface InvoiceViewProps {
  order: Order;
  onBack?: () => void;
  onViewLabel?: (order: Order) => void;
}

const SHEET_PX = { A4: 794, A5: 559 } as const;
const OPTS_KEY = (orderId: string) => `tb-invoice-opts:${orderId}`;
const LAST_KEY = 'tb-invoice-last';

function readJson(key: string): any {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/* ---------- small presentational pieces (kept outside the component so they never remount) ---------- */

const PartyBlock: React.FC<{
  p: InvoiceModel['seller'];
  label?: string;
  showGstin: boolean;
  seller?: boolean;
  logoUrl?: string;
}> = ({ p, label, showGstin, seller, logoUrl }) => (
  <div className="px-2 py-1.5 leading-snug">
    {label && <div className="text-[0.8em] text-neutral-500">{label}</div>}
    <div className="flex items-start justify-between gap-2">
      <div className="font-bold text-[1.1em]">{p.name}</div>
      {seller && logoUrl && <img src={logoUrl} alt="" referrerPolicy="no-referrer" className="h-7 max-w-[90px] object-contain" />}
    </div>
    {p.addressLines.map((l, i) => (
      <div key={i}>{l}</div>
    ))}
    {showGstin && p.gstin && <div>GSTIN/UIN: {p.gstin}</div>}
    {p.stateName && (
      <div>
        State Name : {p.stateName}
        {p.stateCode ? `, Code : ${p.stateCode}` : ''}
      </div>
    )}
    {p.phone && <div>Contact : {p.phone}</div>}
    {seller && p.email && <div>E-Mail : {p.email}</div>}
  </div>
);

const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 py-1.5 text-xs cursor-pointer select-none">
    <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="w-4 h-4 accent-amber-500" />
    <span>{label}</span>
  </label>
);

const Seg: React.FC<{ options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }> = ({
  options,
  value,
  onChange,
}) => (
  <div className="inline-flex border border-neutral-300 dark:border-neutral-700 text-xs font-mono">
    {options.map(o => (
      <button
        key={o.value}
        type="button"
        onClick={() => onChange(o.value)}
        className={`px-3 py-1.5 font-bold ${
          value === o.value
            ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-950'
            : 'text-neutral-600 dark:text-neutral-400'
        }`}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const InvoiceView: React.FC<InvoiceViewProps> = ({ order: orderProp, onBack, onViewLabel }) => {
  const { settings, products, orders, updateOrder, createCreditNote, showToast } = useStore();
  // Always show the latest saved version of the order
  const order = orders.find(o => o.id === orderProp.id) || orderProp;

  const [isProforma, setIsProforma] = useState<boolean>(order.isProforma || false);
  const [upiQrUrl, setUpiQrUrl] = useState<string>('');
  const [showCreditNoteModal, setShowCreditNoteModal] = useState<boolean>(false);
  const [returnReason, setReturnReason] = useState<string>('Customer return / Defective replacement');
  const [createdCn, setCreatedCn] = useState<CreditNote | null>(null);
  const [panelOpen, setPanelOpen] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);

  // ---- invoice options: defaults, then last used layout, then this order's own choices ----
  const [opts, setOpts] = useState<InvoiceOptions>(() => {
    const base = defaultInvoiceOptions(order, settings);
    const last = readJson(LAST_KEY);
    const withLast = last
      ? mergeInvoiceOptions(base, { mode: last.mode, paper: last.paper, roundTo: last.roundTo, show: last.show, jurisdiction: last.jurisdiction })
      : base;
    return mergeInvoiceOptions(withLast, readJson(OPTS_KEY(order.id)));
  });

  useEffect(() => {
    try {
      localStorage.setItem(OPTS_KEY(order.id), JSON.stringify(opts));
      localStorage.setItem(
        LAST_KEY,
        JSON.stringify({ mode: opts.mode, paper: opts.paper, roundTo: opts.roundTo, show: opts.show, jurisdiction: opts.jurisdiction })
      );
    } catch {
      /* storage full or blocked: options just will not be remembered */
    }
  }, [opts, order.id]);

  const setShow = (key: keyof InvoiceOptions['show'], v: boolean) => setOpts(o => ({ ...o, show: { ...o.show, [key]: v } }));
  const setField = (key: keyof InvoiceOptions['fields'], v: string) => setOpts(o => ({ ...o, fields: { ...o.fields, [key]: v } }));

  const toggleItem = (id: string) =>
    setOpts(o => ({
      ...o,
      hiddenItemIds: o.hiddenItemIds.includes(id) ? o.hiddenItemIds.filter(x => x !== id) : [...o.hiddenItemIds, id],
    }));

  const model: InvoiceModel = useMemo(
    () => buildInvoiceModel(order, settings, products, opts),
    [order, settings, products, opts]
  );

  const upiUri = useMemo(
    () => buildUpiPayUri(settings.upiId, settings.businessName, model.grandTotal, `Inv ${model.invoiceNo}`),
    [settings.upiId, settings.businessName, model.grandTotal, model.invoiceNo]
  );

  // QR image for the on-screen preview
  useEffect(() => {
    if (!opts.show.upi) {
      setUpiQrUrl('');
      return;
    }
    generateQrDataUrl(upiUri, 150).then(setUpiQrUrl);
  }, [upiUri, opts.show.upi]);

  // ---- shrink the preview to fit phone screens (print/PDF are not affected) ----
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number>(1);
  const sheetPx = SHEET_PX[opts.paper];
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, Math.max(0.3, (el.clientWidth - 4) / sheetPx)));
    update();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [sheetPx]);

  const handleToggleProforma = (checked: boolean) => {
    setIsProforma(checked);
    updateOrder(order.id, { isProforma: checked });
  };

  // ---- PDF / print / share ----
  const fileName = useMemo(() => {
    const safe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `Invoice-${safe(model.invoiceNo) || 'draft'}-${safe(order.customerName).slice(0, 24) || 'customer'}.pdf`;
  }, [model.invoiceNo, order.customerName]);

  const pdfModel = useMemo<InvoiceModel>(() => ({ ...model, title: isProforma ? 'Proforma Invoice' : model.title }), [model, isProforma]);

  const makePdf = (): Uint8Array => {
    const bankOk = !!(settings.accountNumber || settings.bankName);
    return renderInvoicePdf(pdfModel, opts, {
      businessName: settings.businessName,
      jurisdiction: opts.jurisdiction,
      declaration: DEFAULT_DECLARATION,
      bank: bankOk
        ? {
            holder: settings.accountName || settings.businessName,
            bankName: settings.bankName,
            accountNo: settings.accountNumber,
            branch: settings.branch,
            ifsc: settings.ifscCode,
          }
        : null,
      upiId: settings.upiId,
      qr: opts.show.upi ? getQrMatrix(upiUri) : null,
    });
  };

  const guard = (fn: () => void | Promise<void>) => async () => {
    if (model.rows.length === 0) {
      showToast('Show at least one item on the invoice first', 'warning');
      return;
    }
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      console.error(err);
      showToast('Could not create the PDF. Try Print instead.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSavePdf = guard(() => {
    const bytes = makePdf();
    downloadFile(fileName, bytes, 'application/pdf');
    showToast('PDF created', 'success', 2500);
  });

  const handleShare = guard(async () => {
    const bytes = makePdf();
    const text = `Invoice ${model.invoiceNo} from ${settings.businessName} - Rs. ${fmtMoney(model.grandTotal)}`;
    const result = await shareFile(fileName, bytes, 'application/pdf', text);
    if (result === 'unsupported') {
      downloadFile(fileName, bytes, 'application/pdf');
      showToast('Share is not available here. The PDF is ready to open or save.', 'info', 4500);
    }
  });

  const handlePrint = guard(() => {
    // Phones and embedded frames: the browser print screen is unreliable, so open the real PDF instead.
    // Its viewer has Print and Share built in.
    if (isMobileDevice() || inEmbeddedFrame()) {
      const bytes = makePdf();
      openFileInTab(fileName, bytes, 'application/pdf');
    } else {
      safePrint();
    }
  });

  const handleCreateCreditNote = () => {
    const itemsToReturn = order.items.map(it => ({
      name: it.name,
      qty: it.qty,
      hsn: it.hsn,
      unitPrice: it.unitPrice,
      taxableAmount: it.taxableAmount,
      cgstAmount: it.cgstAmount,
      sgstAmount: it.sgstAmount,
      igstAmount: it.igstAmount,
      totalAmount: it.totalAmount,
    }));
    const cn = createCreditNote({ orderId: order.id, reason: returnReason, itemsToReturn });
    setCreatedCn(cn);
  };

  const hasNonEnglish = useMemo(() => {
    const all = [
      order.customerName,
      ...model.buyer.addressLines,
      ...model.rows.map(r => r.name + r.detail),
      settings.businessName,
      settings.address,
    ].join(' ');
    return /[^\u0020-\u007E\u20B9\u2013\u2014\u2018\u2019\u201C\u201D\u00A0]/.test(all);
  }, [model, order.customerName, settings.businessName, settings.address]);

  const isTax = opts.mode === 'TAX';
  const intra = model.isIntraState;
  const colCount = isTax ? 7 : 6;
  const showHsn = isTax && opts.show.hsnSummary && model.hsnRows.length > 0;
  const showRoundLine = opts.show.roundOff && Math.abs(model.roundOff) > 0.0001;
  const heading = isProforma ? 'Proforma Invoice' : isTax ? 'Tax Invoice' : 'Retail Invoice / Cash Memo';

  const dispatchCells = [{ label: 'Invoice No.', value: model.invoiceNo }, { label: 'Dated', value: model.dated }, ...model.dispatch];

  const cellBorder = 'border-r border-black';

  return (
    <div className="space-y-3">
      {/* ===================== Toolbar (not printed) ===================== */}
      <div className="no-print p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-3">
        <div className="flex items-start gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
              title="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 font-mono truncate">
              {heading} · {model.invoiceNo}
            </h1>
            <p className="text-xs text-neutral-500 font-mono truncate">
              {order.customerName} · {model.dated} · Total Rs. {fmtMoney(model.grandTotal)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={handlePrint}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:text-neutral-950 text-xs font-mono font-bold disabled:opacity-60"
          >
            <Printer className="w-4 h-4" />
            <span>Print</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleSavePdf}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 text-xs font-mono font-bold disabled:opacity-60"
          >
            <FileDown className="w-4 h-4" />
            <span>Save PDF</span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleShare}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 border border-neutral-300 dark:border-neutral-700 text-xs font-mono font-bold disabled:opacity-60"
          >
            <Share2 className="w-4 h-4" />
            <span>Share / WhatsApp</span>
          </button>
          <button
            type="button"
            onClick={() => setPanelOpen(v => !v)}
            className={`flex items-center justify-center gap-1.5 px-4 py-2.5 border text-xs font-mono font-bold ${
              panelOpen
                ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-neutral-950'
                : 'border-neutral-300 dark:border-neutral-700'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>
              Items &amp; options
              {model.hiddenCount > 0 ? ` (${model.hiddenCount} hidden)` : ''}
            </span>
          </button>
          {onViewLabel && (
            <button
              type="button"
              onClick={() => onViewLabel(order)}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-amber-100 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border border-amber-300 text-xs font-mono font-bold"
              title="Next: courier label"
            >
              <Truck className="w-4 h-4" />
              <span>Courier label</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowCreditNoteModal(true)}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 text-xs font-mono"
            title="Generate Credit Note"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="sm:hidden">Credit note</span>
          </button>
        </div>

        {hasNonEnglish && (
          <p className="text-[11px] text-amber-800 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-200 border border-amber-200 p-2">
            Some names or addresses use non-English letters. The PDF can only show English letters (they appear as ?). Use
            Print from a computer for those, or write them in English.
          </p>
        )}
      </div>

      {/* ===================== Items & options panel (not printed) ===================== */}
      {panelOpen && (
        <div className="no-print p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-5 text-xs">
          {/* Items */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-bold uppercase tracking-wide">Items on this invoice</h3>
              <div className="flex gap-3 font-semibold text-blue-600 dark:text-blue-400">
                <button type="button" onClick={() => setOpts(o => ({ ...o, hiddenItemIds: [] }))}>
                  Show all
                </button>
                <button type="button" onClick={() => setOpts(o => ({ ...o, hiddenItemIds: order.items.map(i => i.id) }))}>
                  Hide all
                </button>
              </div>
            </div>
            <div className="divide-y divide-neutral-200 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800">
              {order.items.map(it => {
                const hidden = opts.hiddenItemIds.includes(it.id);
                return (
                  <button
                    type="button"
                    key={it.id}
                    onClick={() => toggleItem(it.id)}
                    className={`w-full flex items-center gap-3 p-2.5 text-left ${hidden ? 'bg-neutral-100 dark:bg-neutral-800/60' : ''}`}
                  >
                    {hidden ? <EyeOff className="w-4 h-4 text-neutral-400 shrink-0" /> : <Eye className="w-4 h-4 text-emerald-600 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <div className={`font-semibold truncate ${hidden ? 'line-through text-neutral-400' : ''}`}>{it.name}</div>
                      <div className="text-neutral-500 font-mono">
                        {it.qty} x {fmtMoney(it.unitPrice)}
                      </div>
                    </div>
                    <div className={`font-mono font-bold ${hidden ? 'text-neutral-400' : ''}`}>{fmtMoney(it.totalAmount)}</div>
                  </button>
                );
              })}
            </div>
            {model.hiddenCount > 0 && (
              <p className="text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 p-2">
                Showing {model.rows.length} of {order.items.length} items. This invoice total is Rs. {fmtMoney(model.grandTotal)} (full order: Rs.{' '}
                {fmtMoney(model.orderGrandTotal)}). Hidden items are left out of the totals and the GST summary, and stock is not changed.
              </p>
            )}
            {model.rows.length === 0 && <p className="text-red-600 font-bold">All items are hidden. Show at least one.</p>}
          </section>

          {/* Layout */}
          <section className="space-y-2">
            <h3 className="font-bold uppercase tracking-wide">Layout</h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <div className="space-y-1">
                <div className="text-neutral-500">Style</div>
                <Seg
                  value={opts.mode}
                  onChange={v => setOpts(o => ({ ...o, mode: v as InvoiceOptions['mode'] }))}
                  options={[
                    { value: 'TAX', label: 'Tax invoice' },
                    { value: 'SIMPLE', label: 'Simple bill' },
                  ]}
                />
              </div>
              <div className="space-y-1">
                <div className="text-neutral-500">Paper</div>
                <Seg
                  value={opts.paper}
                  onChange={v => setOpts(o => ({ ...o, paper: v as InvoiceOptions['paper'] }))}
                  options={[
                    { value: 'A4', label: 'A4' },
                    { value: 'A5', label: 'A5' },
                  ]}
                />
              </div>
              <div className="space-y-1">
                <div className="text-neutral-500">Round total to</div>
                <Seg
                  value={String(opts.roundTo)}
                  onChange={v => setOpts(o => ({ ...o, roundTo: Number(v) as InvoiceOptions['roundTo'] }))}
                  options={[
                    { value: '1', label: 'Rs 1' },
                    { value: '10', label: 'Rs 10' },
                    { value: '0', label: 'None' },
                  ]}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 pt-1">
              <input type="checkbox" checked={isProforma} onChange={e => handleToggleProforma(e.target.checked)} className="w-4 h-4 accent-amber-500" />
              <span>Mark as Proforma (quotation, not a tax invoice)</span>
            </label>
          </section>

          {/* Show / hide parts */}
          <section>
            <h3 className="font-bold uppercase tracking-wide mb-1">Show or hide</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <Toggle label="Dispatch details block" checked={opts.show.dispatch} onChange={v => setShow('dispatch', v)} />
              <Toggle label="Separate ship-to address (if different)" checked={opts.show.shipTo} onChange={v => setShow('shipTo', v)} />
              <Toggle label="Buyer GSTIN" checked={opts.show.buyerGstin} onChange={v => setShow('buyerGstin', v)} />
              <Toggle label="Item SKU / brand / warranty line" checked={opts.show.itemDetails} onChange={v => setShow('itemDetails', v)} />
              <Toggle label="Round-off line" checked={opts.show.roundOff} onChange={v => setShow('roundOff', v)} />
              <Toggle label="HSN summary table" checked={opts.show.hsnSummary} onChange={v => setShow('hsnSummary', v)} />
              <Toggle label="Tax amount in words" checked={opts.show.taxWords} onChange={v => setShow('taxWords', v)} />
              <Toggle label="Remarks / notes" checked={opts.show.remarks} onChange={v => setShow('remarks', v)} />
              <Toggle label="Declaration" checked={opts.show.declaration} onChange={v => setShow('declaration', v)} />
              <Toggle label="Bank details" checked={opts.show.bank} onChange={v => setShow('bank', v)} />
              <Toggle label="UPI QR code" checked={opts.show.upi} onChange={v => setShow('upi', v)} />
            </div>
          </section>

          {/* Dispatch fields */}
          <section className="space-y-2">
            <h3 className="font-bold uppercase tracking-wide">Dispatch details (optional)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  ['deliveryNote', 'Delivery note'],
                  ['termsOfPayment', 'Mode / terms of payment'],
                  ['dispatchDocNo', 'Dispatch doc no. / AWB'],
                  ['buyerOrderNo', "Buyer's order no."],
                  ['dispatchedThrough', 'Dispatched through'],
                  ['destination', 'Destination'],
                ] as [keyof InvoiceOptions['fields'], string][]
              ).map(([key, label]) => (
                <label key={key} className="block">
                  <span className="block text-neutral-500 mb-1 font-semibold">{label}</span>
                  <input
                    type="text"
                    value={opts.fields[key]}
                    onChange={e => setField(key, e.target.value)}
                    className="w-full p-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black"
                  />
                </label>
              ))}
              <label className="block sm:col-span-2">
                <span className="block text-neutral-500 mb-1 font-semibold">Jurisdiction (prints as SUBJECT TO ... JURISDICTION)</span>
                <input
                  type="text"
                  value={opts.jurisdiction}
                  onChange={e => setOpts(o => ({ ...o, jurisdiction: e.target.value }))}
                  className="w-full p-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black"
                />
              </label>
            </div>
          </section>
        </div>
      )}

      {order.creditNoteRef && (
        <div className="no-print p-3 bg-neutral-100 dark:bg-neutral-800 border-l-4 border-neutral-900 text-xs text-neutral-800 dark:text-neutral-200 font-mono">
          Credit note <strong>{order.creditNoteRef}</strong> has been issued for this invoice.
        </div>
      )}

      {/* ===================== Invoice preview (this is what prints) ===================== */}
      <div ref={wrapRef} className="tb-invoice-wrap w-full overflow-hidden">
        <div className="tb-invoice-zoom mx-auto" style={{ zoom: scale, width: sheetPx }}>
          <div
            data-page-size={opts.paper}
            className="tb-invoice-sheet invoice-document-canvas bg-white text-black font-sans border border-neutral-300 shadow-sm flex flex-col"
            style={{
              width: sheetPx,
              minHeight: opts.paper === 'A4' ? 1123 : 794,
              padding: opts.paper === 'A4' ? 22 : 14,
              fontSize: opts.paper === 'A4' ? 11.5 : 9.5,
              boxSizing: 'border-box',
            }}
          >
            <div className="text-center font-bold text-[1.35em] pb-1">{heading}</div>
            {!isTax && !isProforma && <div className="text-center text-[0.8em] text-neutral-500 -mt-1 pb-1">(All prices include applicable GST)</div>}
            {isProforma && <div className="text-center text-[0.8em] text-neutral-500 -mt-1 pb-1">(Price quotation only - not a GST tax invoice)</div>}

            <div className="border border-black flex flex-col flex-1">
              {/* Parties + invoice details */}
              <div className="grid grid-cols-2 border-b border-black">
                <div className="border-r border-black">
                  <PartyBlock p={model.seller} showGstin seller logoUrl={settings.logoUrl} />
                  <div className="border-t border-black">
                    <PartyBlock p={model.buyer} label="Buyer (Bill to)" showGstin={opts.show.buyerGstin} />
                  </div>
                  {model.consignee && (
                    <div className="border-t border-black">
                      <PartyBlock p={model.consignee} label="Consignee (Ship to)" showGstin={opts.show.buyerGstin} />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 content-start">
                  {dispatchCells.map((c, i) => (
                    <div key={i} className={`px-2 py-1 min-h-[2.6em] border-b border-black ${i % 2 === 0 ? 'border-r' : ''}`}>
                      <div className="text-[0.8em] text-neutral-500 leading-tight">{c.label}</div>
                      <div className="font-bold">{c.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Items table */}
              <div className="flex-1 min-h-0">
                <table className="w-full border-collapse" style={{ height: '100%', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '4.5%' }} />
                    <col />
                    {isTax && <col style={{ width: '11%' }} />}
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '11%' }} />
                    <col style={{ width: '5.5%' }} />
                    <col style={{ width: '14%' }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-black font-bold">
                      <th className={`p-1 ${cellBorder}`}>Sl</th>
                      <th className={`p-1 ${cellBorder}`}>Description of Goods</th>
                      {isTax && <th className={`p-1 ${cellBorder}`}>HSN/SAC</th>}
                      <th className={`p-1 ${cellBorder}`}>Quantity</th>
                      <th className={`p-1 ${cellBorder}`}>Rate</th>
                      <th className={`p-1 ${cellBorder}`}>per</th>
                      <th className="p-1">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.rows.map(r => (
                      <tr key={r.sl} className="align-top">
                        <td className={`p-1 text-center ${cellBorder}`}>{r.sl}</td>
                        <td className={`p-1 ${cellBorder}`}>
                          <div className="font-bold leading-tight">{r.name}</div>
                          {opts.show.itemDetails && r.detail && <div className="text-[0.8em] text-neutral-500">{r.detail}</div>}
                        </td>
                        {isTax && <td className={`p-1 ${cellBorder}`}>{r.hsn}</td>}
                        <td className={`p-1 text-right font-bold ${cellBorder}`}>
                          {r.qty} {r.unit}
                        </td>
                        <td className={`p-1 text-right tabular-nums ${cellBorder}`}>{fmtMoney(r.rate)}</td>
                        <td className={`p-1 text-center ${cellBorder}`}>{r.unit}</td>
                        <td className="p-1 text-right font-bold tabular-nums">{fmtMoney(r.amount)}</td>
                      </tr>
                    ))}
                    {/* filler row: pushes the tax lines and total to the bottom, like a Tally invoice */}
                    <tr style={{ height: '100%' }}>
                      {Array.from({ length: colCount }).map((_, i) => (
                        <td key={i} className={i < colCount - 1 ? cellBorder : ''} />
                      ))}
                    </tr>
                    {model.taxLines.map((t, i) => (
                      <tr key={'t' + i}>
                        <td className={cellBorder} />
                        <td className={`p-1 text-right font-bold italic ${cellBorder}`}>{t.label}</td>
                        {isTax && <td className={cellBorder} />}
                        <td className={cellBorder} />
                        <td className={cellBorder} />
                        <td className={cellBorder} />
                        <td className="p-1 text-right font-bold tabular-nums">{fmtMoney(t.amount)}</td>
                      </tr>
                    ))}
                    {showRoundLine && (
                      <tr>
                        <td className={cellBorder} />
                        <td className={`p-1 text-right italic ${cellBorder}`}>Round Off</td>
                        {isTax && <td className={cellBorder} />}
                        <td className={cellBorder} />
                        <td className={cellBorder} />
                        <td className={cellBorder} />
                        <td className="p-1 text-right tabular-nums">
                          {model.roundOff < 0 ? `(-)${fmtMoney(Math.abs(model.roundOff))}` : fmtMoney(model.roundOff)}
                        </td>
                      </tr>
                    )}
                    <tr className="border-y border-black font-bold">
                      <td className={cellBorder} />
                      <td className={`p-1 text-right ${cellBorder}`}>Total</td>
                      {isTax && <td className={cellBorder} />}
                      <td className={`p-1 text-right ${cellBorder}`}>{model.totalQty} Pcs</td>
                      <td className={cellBorder} />
                      <td className={cellBorder} />
                      <td className="p-1 text-right tabular-nums">₹ {fmtMoney(model.grandTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Amount in words */}
              <div className="px-2 py-1.5 border-b border-black">
                <div className="flex justify-between text-[0.8em] text-neutral-500">
                  <span>Amount Chargeable (in words)</span>
                  <span className="italic">E. &amp; O.E</span>
                </div>
                <div className="font-bold text-[1.05em]">{model.amountWords}</div>
                {model.remarks && <div className="italic text-[0.85em] text-neutral-600 mt-0.5">Remarks: {model.remarks}</div>}
              </div>

              {/* HSN summary */}
              {showHsn && (
                <table className="w-full border-collapse border-b border-black text-[0.92em]">
                  <thead>
                    <tr className="font-bold">
                      <th rowSpan={2} className={`p-1 text-center ${cellBorder} border-b`}>
                        HSN/SAC
                      </th>
                      <th rowSpan={2} className={`p-1 text-center ${cellBorder} border-b`}>
                        Taxable Value
                      </th>
                      {intra ? (
                        <>
                          <th colSpan={2} className={`p-0.5 text-center ${cellBorder} border-b`}>
                            Central Tax
                          </th>
                          <th colSpan={2} className={`p-0.5 text-center ${cellBorder} border-b`}>
                            State Tax
                          </th>
                        </>
                      ) : (
                        <th colSpan={2} className={`p-0.5 text-center ${cellBorder} border-b`}>
                          Integrated Tax
                        </th>
                      )}
                      <th rowSpan={2} className="p-1 text-center border-b border-black">
                        Total
                        <br />
                        Tax Amount
                      </th>
                    </tr>
                    <tr className="font-bold text-[0.9em]">
                      {(intra ? [0, 1] : [0]).map(g => (
                        <React.Fragment key={g}>
                          <th className={`p-0.5 ${cellBorder} border-b`}>Rate</th>
                          <th className={`p-0.5 ${cellBorder} border-b`}>Amount</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {model.hsnRows.map((r, i) => (
                      <tr key={i}>
                        <td className={`p-1 ${cellBorder}`}>{r.hsn}</td>
                        <td className={`p-1 text-right tabular-nums ${cellBorder}`}>{fmtMoney(r.taxable)}</td>
                        {intra ? (
                          <>
                            <td className={`p-1 text-right ${cellBorder}`}>{r.cgstRate}%</td>
                            <td className={`p-1 text-right tabular-nums ${cellBorder}`}>{fmtMoney(r.cgstAmt)}</td>
                            <td className={`p-1 text-right ${cellBorder}`}>{r.sgstRate}%</td>
                            <td className={`p-1 text-right tabular-nums ${cellBorder}`}>{fmtMoney(r.sgstAmt)}</td>
                          </>
                        ) : (
                          <>
                            <td className={`p-1 text-right ${cellBorder}`}>{r.igstRate}%</td>
                            <td className={`p-1 text-right tabular-nums ${cellBorder}`}>{fmtMoney(r.igstAmt)}</td>
                          </>
                        )}
                        <td className="p-1 text-right tabular-nums">{fmtMoney(r.totalTax)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold border-t border-black">
                      <td className={`p-1 text-right ${cellBorder}`}>Total</td>
                      <td className={`p-1 text-right tabular-nums ${cellBorder}`}>{fmtMoney(model.taxableTotal)}</td>
                      {intra ? (
                        <>
                          <td className={cellBorder} />
                          <td className={`p-1 text-right tabular-nums ${cellBorder}`}>{fmtMoney(model.hsnRows.reduce((s, r) => s + r.cgstAmt, 0))}</td>
                          <td className={cellBorder} />
                          <td className={`p-1 text-right tabular-nums ${cellBorder}`}>{fmtMoney(model.hsnRows.reduce((s, r) => s + r.sgstAmt, 0))}</td>
                        </>
                      ) : (
                        <>
                          <td className={cellBorder} />
                          <td className={`p-1 text-right tabular-nums ${cellBorder}`}>{fmtMoney(model.hsnRows.reduce((s, r) => s + r.igstAmt, 0))}</td>
                        </>
                      )}
                      <td className="p-1 text-right tabular-nums">{fmtMoney(model.taxTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              )}

              {isTax && opts.show.taxWords && (
                <div className="px-2 py-1.5 border-b border-black font-bold">Tax Amount (in words) : {model.taxWords}</div>
              )}

              {/* Declaration / bank / signature */}
              <div className="grid grid-cols-[56%_44%]">
                <div className="p-2 border-r border-black space-y-2 text-[0.85em]">
                  {opts.show.declaration && (
                    <div>
                      <div className="font-bold underline">Declaration</div>
                      <div>{DEFAULT_DECLARATION}</div>
                    </div>
                  )}
                  {opts.show.bank && (settings.accountNumber || settings.bankName) && (
                    <div>
                      <div className="font-bold">Company's Bank Details</div>
                      <div>A/c Holder's Name : {settings.accountName || settings.businessName}</div>
                      <div>Bank Name : {settings.bankName}</div>
                      <div>A/c No. : {settings.accountNumber}</div>
                      <div>Branch &amp; IFS Code : {[settings.branch, settings.ifscCode].filter(Boolean).join(' & ')}</div>
                    </div>
                  )}
                  {opts.show.upi && (
                    <div className="flex items-center gap-2">
                      {upiQrUrl && <img src={upiQrUrl} alt="UPI QR" className="w-16 h-16 border border-black p-0.5 bg-white" />}
                      <div>
                        <div className="font-bold">Scan to pay (UPI)</div>
                        <div>{settings.upiId}</div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-2 flex flex-col items-center justify-between text-center min-h-[6.5em] invoice-signature-block">
                  <div className="font-bold">for {settings.businessName}</div>
                  {settings.signatureUrl ? (
                    <img src={settings.signatureUrl} alt="Signature" className="max-h-12 max-w-full object-contain" />
                  ) : (
                    <div className="h-8" />
                  )}
                  <div>Authorised Signatory</div>
                </div>
              </div>
            </div>

            <div className="text-center pt-1.5">
              <div className="font-bold uppercase text-[0.95em]">Subject to {opts.jurisdiction} jurisdiction</div>
              <div className="text-[0.8em] text-neutral-500">This is a Computer Generated Invoice</div>
            </div>
          </div>
        </div>
      </div>

      {/* ===================== Credit note modal ===================== */}
      {showCreditNoteModal && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 p-5 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
              <RotateCcw className="w-4 h-4" />
              Generate Credit Note for {order.invoiceNo || order.orderNo}
            </h3>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300 mb-1">Reason for Return / Adjustment:</label>
              <textarea
                value={returnReason}
                onChange={e => setReturnReason(e.target.value)}
                rows={3}
                className="w-full text-xs p-2 border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800"
              />
            </div>

            <div className="p-3 bg-neutral-100 dark:bg-neutral-800 text-xs font-mono">
              Total Credit Refund Amount: <strong>Rs. {fmtMoney(order.grandTotal)}</strong>
            </div>

            {createdCn && (
              <div className="p-2 bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-xs font-mono flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                <span>
                  Issued: <strong>{createdCn.creditNoteNo}</strong>
                </span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => {
                  setShowCreditNoteModal(false);
                  setCreatedCn(null);
                }}
                className="px-3 py-1.5 text-xs border border-neutral-300 dark:border-neutral-700 font-mono"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleCreateCreditNote}
                className="px-3 py-1.5 text-xs bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 font-bold font-mono"
              >
                Confirm &amp; Issue Credit Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
