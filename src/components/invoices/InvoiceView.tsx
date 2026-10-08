import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../context/StoreContext';
import type { Order } from '../../types';
import {
  type InvoiceOptions,
  type InvoiceModel,
  type InvoicePaper,
  type InvoiceMode,
  defaultInvoiceOptions,
  mergeInvoiceOptions,
  buildInvoiceModel,
  fmtMoney,
  DEFAULT_DECLARATION,
} from '../../utils/invoiceModel';
import { safePrint } from '../../utils/print';
import {
  ArrowLeft,
  Printer,
  FileDown,
  Sliders,
  ChevronDown,
  ChevronUp,
  Truck,
} from 'lucide-react';

interface InvoiceViewProps {
  order: Order;
  onBack?: () => void;
  onViewLabel?: (order: Order) => void;
}

/* ------------------------------------------------------------------ */
/*  Small primitives                                                   */
/* ------------------------------------------------------------------ */

const Field: React.FC<{ label: string; value?: string | null; mono?: boolean }> = ({
  label,
  value,
  mono,
}) => {
  if (!value) return null;
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium whitespace-nowrap">
        {label}
      </span>
      <span className={`text-[11px] text-neutral-900 font-semibold ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
};

const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}> = ({ checked, onChange, label, hint }) => (
  <label className="flex items-start gap-2 cursor-pointer group py-1">
    <input
      type="checkbox"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      className="mt-0.5 rounded border-neutral-300 text-neutral-900 focus:ring-0"
    />
    <span className="text-[11px] leading-tight">
      <span className="text-neutral-800 font-medium group-hover:text-black">{label}</span>
      {hint && <span className="block text-[10px] text-neutral-500 mt-0.5">{hint}</span>}
    </span>
  </label>
);

/* ------------------------------------------------------------------ */
/*  Options panel                                                      */
/* ------------------------------------------------------------------ */

const OptionsPanel: React.FC<{
  opts: InvoiceOptions;
  setOpts: (o: InvoiceOptions) => void;
  order: Order;
}> = ({ opts, setOpts, order }) => {
  const patch = (p: Partial<InvoiceOptions>) => setOpts({ ...opts, ...p });
  const patchShow = (p: Partial<InvoiceOptions['show']>) =>
    setOpts({ ...opts, show: { ...opts.show, ...p } });
  const patchFields = (p: Partial<InvoiceOptions['fields']>) =>
    setOpts({ ...opts, fields: { ...opts.fields, ...p } });

  const toggleHidden = (id: string) => {
    const next = opts.hiddenItemIds.includes(id)
      ? opts.hiddenItemIds.filter(x => x !== id)
      : [...opts.hiddenItemIds, id];
    patch({ hiddenItemIds: next });
  };

  return (
    <div className="space-y-4 text-xs">
      {/* Format row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-1.5">
            Invoice Type
          </div>
          <div className="flex flex-wrap gap-1">
            {(['TAX', 'SIMPLE'] as InvoiceMode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => patch({ mode: m })}
                className={`px-2.5 py-1 text-[11px] font-medium border ${
                  opts.mode === m
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                {m === 'TAX' ? 'Tax Invoice (Tally)' : 'Retail / Cash Memo'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-1.5">
            Paper
          </div>
          <div className="flex flex-wrap gap-1">
            {(['A4', 'A5'] as InvoicePaper[]).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => patch({ paper: p })}
                className={`px-2.5 py-1 text-[11px] font-medium border ${
                  opts.paper === p
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-1.5">
            Round Off
          </div>
          <div className="flex flex-wrap gap-1">
            {([0, 1, 10] as const).map(r => (
              <button
                key={r}
                type="button"
                onClick={() => patch({ roundTo: r })}
                className={`px-2.5 py-1 text-[11px] font-medium border ${
                  opts.roundTo === r
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                {r === 0 ? 'None' : r === 1 ? '₹1' : '₹10'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-neutral-200" />

      {/* Section toggles + editable fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-2">
            Sections to show
          </div>
          <div className="grid grid-cols-2 gap-x-4">
            <Toggle
              checked={opts.show.dispatch}
              onChange={v => patchShow({ dispatch: v })}
              label="Dispatch & transport"
            />
            <Toggle
              checked={opts.show.hsnSummary}
              onChange={v => patchShow({ hsnSummary: v })}
              label="HSN summary"
            />
            <Toggle
              checked={opts.show.taxWords}
              onChange={v => patchShow({ taxWords: v })}
              label="Tax in words"
            />
            <Toggle
              checked={opts.show.bank}
              onChange={v => patchShow({ bank: v })}
              label="Bank details"
            />
            <Toggle
              checked={opts.show.upi}
              onChange={v => patchShow({ upi: v })}
              label="UPI (ID / QR)"
            />
            <Toggle
              checked={opts.show.declaration}
              onChange={v => patchShow({ declaration: v })}
              label="Declaration"
            />
            <Toggle
              checked={opts.show.buyerGstin}
              onChange={v => patchShow({ buyerGstin: v })}
              label="Buyer GSTIN"
            />
            <Toggle
              checked={opts.show.itemDetails}
              onChange={v => patchShow({ itemDetails: v })}
              label="Item detail line"
              hint="SKU · Brand · Warranty"
            />
            <Toggle
              checked={opts.show.roundOff}
              onChange={v => patchShow({ roundOff: v })}
              label="Round off line"
            />
            <Toggle
              checked={opts.show.remarks}
              onChange={v => patchShow({ remarks: v })}
              label="Remarks / notes"
            />
            <Toggle
              checked={opts.show.shipTo}
              onChange={v => patchShow({ shipTo: v })}
              label="Ship To block"
              hint="Only if billing ≠ shipping"
            />
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-2">
            Document fields
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['deliveryNote', 'Delivery Note'],
                ['dispatchDocNo', 'Dispatch Doc No.'],
                ['dispatchedThrough', 'Dispatched Through'],
                ['destination', 'Destination'],
                ['termsOfPayment', 'Mode / Terms'],
                ['buyerOrderNo', "Buyer's Order No."],
              ] as const
            ).map(([k, label]) => (
              <div key={k}>
                <label className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-0.5">
                  {label}
                </label>
                <input
                  type="text"
                  value={opts.fields[k]}
                  onChange={e => patchFields({ [k]: e.target.value })}
                  className="w-full px-2 py-1 text-[11px] border border-neutral-300 bg-white focus:outline-none focus:border-neutral-900"
                />
              </div>
            ))}
          </div>

          <div className="mt-3">
            <label className="block text-[10px] uppercase tracking-wider text-neutral-500 mb-0.5">
              Jurisdiction
            </label>
            <input
              type="text"
              value={opts.jurisdiction}
              onChange={e => patch({ jurisdiction: e.target.value })}
              className="w-full px-2 py-1 text-[11px] border border-neutral-300 bg-white focus:outline-none focus:border-neutral-900"
            />
          </div>
        </div>
      </div>

      {/* Hidden items — Tally-style item masking */}
      {order.items.length > 0 && (
        <>
          <div className="border-t border-neutral-200" />
          <div>
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-2">
              Items on this invoice
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {order.items.map(it => {
                const hidden = opts.hiddenItemIds.includes(it.id);
                return (
                  <label
                    key={it.id}
                    className="flex items-center gap-2 text-[11px] py-1 cursor-pointer hover:bg-neutral-50 px-1 -mx-1"
                  >
                    <input
                      type="checkbox"
                      checked={!hidden}
                      onChange={() => toggleHidden(it.id)}
                      className="rounded border-neutral-300 text-neutral-900 focus:ring-0"
                    />
                    <span className={hidden ? 'text-neutral-400 line-through' : 'text-neutral-800'}>
                      {it.qty}× {it.name}
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono ml-auto">
                      {it.sku}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export const InvoiceView: React.FC<InvoiceViewProps> = ({ order, onBack, onViewLabel }) => {
  const { settings, products, showToast } = useStore();

  const STORAGE_KEY = 'otbims.invoice.options.v1';

  const [opts, setOpts] = useState<InvoiceOptions>(() => {
    const base = defaultInvoiceOptions(order, settings);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return mergeInvoiceOptions(base, JSON.parse(raw));
    } catch {}
    return base;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(opts));
    } catch {}
  }, [opts]);

  const model: InvoiceModel = useMemo(
    () => buildInvoiceModel(order, settings as any, products, opts),
    [order, settings, products, opts]
  );

  const [panelOpen, setPanelOpen] = useState(false);

  const handlePrint = () => safePrint();

  const handleSavePdf = () => {
    showToast('In the print dialog, choose "Save as PDF" as the destination', 'info');
    safePrint();
  };

  const isA5 = opts.paper === 'A5';

  return (
    <div className="space-y-4">
      {/* ---------- Toolbar ---------- */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <span className="px-2 py-0.5 bg-neutral-900 text-white text-[10px] font-mono font-bold tracking-wider">
            1. INVOICE
          </span>
          <div>
            <div className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              {order.invoiceNo || order.orderNo}
            </div>
            <div className="text-[11px] text-neutral-500">
              {order.customerName} · {order.customerPhone}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPanelOpen(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs font-semibold ${
              panelOpen
                ? 'border-neutral-900 bg-neutral-100 dark:bg-neutral-800'
                : 'border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Customize
            {panelOpen ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {onViewLabel && (
            <button
              type="button"
              onClick={() => onViewLabel(order)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800"
              title="Next: Shipping Label"
            >
              <Truck className="w-3.5 h-3.5 text-amber-500" />
              <span>2. Label →</span>
            </button>
          )}

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-neutral-900 dark:border-white text-neutral-900 dark:text-white text-xs font-bold hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>

          <button
            type="button"
            onClick={handleSavePdf}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 text-xs font-bold hover:opacity-90"
          >
            <FileDown className="w-3.5 h-3.5" />
            Save PDF
          </button>
        </div>
      </div>

      {/* ---------- Customize panel ---------- */}
      {panelOpen && (
        <div className="no-print p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800">
          <OptionsPanel opts={opts} setOpts={setOpts} order={order} />
        </div>
      )}

      {/* ---------- Invoice preview ---------- */}
      <div className="flex justify-center p-4 print:p-0">
        <div
          className={`invoice-sheet bg-white text-neutral-900 shadow-sm print:shadow-none ${
            isA5 ? 'w-[148mm] min-h-[210mm]' : 'w-[210mm] min-h-[297mm]'
          } ${isA5 ? 'p-5' : 'p-8'}`}
          style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          {/* ======= HEADER ======= */}
          <div className="flex items-start justify-between gap-6 pb-3 border-b border-neutral-300">
            <div className="min-w-0">
              <div className={`font-bold tracking-tight ${isA5 ? 'text-lg' : 'text-xl'}`}>
                {model.seller.name}
              </div>
              {model.seller.addressLines.map((l, i) => (
                <div key={i} className="text-[11px] text-neutral-600 leading-snug">
                  {l}
                </div>
              ))}
              <div className="text-[11px] text-neutral-600 mt-0.5 font-mono">
                {model.seller.gstin && <>GSTIN: {model.seller.gstin} · </>}
                {model.seller.stateName} ({model.seller.stateCode})
              </div>
              {(model.seller.phone || model.seller.email) && (
                <div className="text-[11px] text-neutral-600">
                  {model.seller.phone}
                  {model.seller.phone && model.seller.email && ' · '}
                  {model.seller.email}
                </div>
              )}
            </div>

            <div className="text-right shrink-0">
              <div
                className={`inline-block border border-neutral-900 px-3 py-1 font-bold tracking-[0.2em] uppercase ${
                  isA5 ? 'text-xs' : 'text-sm'
                }`}
              >
                {model.title}
              </div>
              {model.subtitle && (
                <div className="text-[10px] italic text-neutral-500 mt-1 max-w-[180px] ml-auto">
                  {model.subtitle}
                </div>
              )}
            </div>
          </div>

          {/* ======= META STRIP ======= */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 py-3 border-b border-neutral-200 text-[11px]">
            <Field label="Invoice No." value={model.invoiceNo} mono />
            <div className="text-right">
              <Field label="Dated" value={model.dated} mono />
            </div>
            <Field
              label="Place of Supply"
              value={`${model.buyer.stateName} (${model.buyer.stateCode})`}
            />
            <div className="text-right">
              <Field label="Reverse Charge" value="No" />
            </div>
            {order.orderNo && order.orderNo !== model.invoiceNo && (
              <Field label="Order Ref." value={order.orderNo} mono />
            )}
            {order.dueDate && (
              <div className="text-right">
                <Field label="Due Date" value={order.dueDate} mono />
              </div>
            )}
          </div>

          {/* ======= PARTIES ======= */}
          <div
            className={`grid ${
              model.consignee ? 'grid-cols-2' : 'grid-cols-1'
            } gap-6 py-4 border-b border-neutral-200`}
          >
            <div>
              <div className="text-[9px] uppercase tracking-[0.15em] text-neutral-500 font-semibold mb-1.5">
                Bill To
              </div>
              <div className="text-sm font-bold">{model.buyer.name}</div>
              {model.buyer.addressLines.map((l, i) => (
                <div key={i} className="text-[11px] text-neutral-700 leading-snug">
                  {l}
                </div>
              ))}
              {model.buyer.phone && (
                <div className="text-[11px] text-neutral-700 font-mono mt-0.5">
                  Ph: {model.buyer.phone}
                </div>
              )}
              {opts.show.buyerGstin && model.buyer.gstin && (
                <div className="text-[11px] text-neutral-800 font-mono mt-1 font-semibold">
                  GSTIN: {model.buyer.gstin}
                </div>
              )}
              <div className="text-[11px] text-neutral-700 mt-0.5">
                State: {model.buyer.stateName} ({model.buyer.stateCode})
              </div>
            </div>

            {model.consignee && (
              <div>
                <div className="text-[9px] uppercase tracking-[0.15em] text-neutral-500 font-semibold mb-1.5">
                  Ship To
                </div>
                <div className="text-sm font-bold">{model.consignee.name}</div>
                {model.consignee.addressLines.map((l, i) => (
                  <div key={i} className="text-[11px] text-neutral-700 leading-snug">
                    {l}
                  </div>
                ))}
                {opts.show.buyerGstin && model.consignee.gstin && (
                  <div className="text-[11px] text-neutral-800 font-mono mt-1 font-semibold">
                    GSTIN: {model.consignee.gstin}
                  </div>
                )}
                <div className="text-[11px] text-neutral-700 mt-0.5">
                  State: {model.consignee.stateName} ({model.consignee.stateCode})
                </div>
              </div>
            )}
          </div>

          {/* ======= DISPATCH STRIP ======= */}
          {model.dispatch.length > 0 && (
            <div className="grid grid-cols-3 gap-x-4 gap-y-1 py-3 border-b border-neutral-200">
              {model.dispatch
                .filter(d => d.value)
                .map(d => (
                  <Field key={d.label} label={d.label} value={d.value} />
                ))}
            </div>
          )}
                    {/* ======= ITEMS TABLE ======= */}
          <div className="pt-3">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-neutral-900 text-[9px] uppercase tracking-wider text-neutral-600">
                  <th className="text-left py-2 font-semibold w-6">#</th>
                  <th className="text-left py-2 font-semibold">Description</th>
                  <th className="text-left py-2 font-semibold w-14">HSN</th>
                  <th className="text-right py-2 font-semibold w-10">Qty</th>
                  <th className="text-right py-2 font-semibold w-16">Rate</th>
                  <th className="text-right py-2 font-semibold w-20">Taxable</th>
                  {model.mode === 'TAX' && (
                    <th className="text-right py-2 font-semibold w-12">GST %</th>
                  )}
                  <th className="text-right py-2 font-semibold w-20">Amount</th>
                </tr>
              </thead>
              <tbody>
                {model.rows.map(r => (
                  <tr key={r.sl} className="border-b border-neutral-100 align-top">
                    <td className="py-2 text-neutral-500">{r.sl}</td>
                    <td className="py-2 pr-2">
                      <div className="font-medium text-neutral-900">{r.name}</div>
                      {opts.show.itemDetails && r.detail && (
                        <div className="text-[10px] text-neutral-500 mt-0.5">{r.detail}</div>
                      )}
                    </td>
                    <td className="py-2 font-mono text-neutral-600">{r.hsn}</td>
                    <td className="py-2 text-right tabular-nums">
                      {r.qty} <span className="text-neutral-400">{r.unit}</span>
                    </td>
                    <td className="py-2 text-right tabular-nums">{fmtMoney(r.rate)}</td>
                    <td className="py-2 text-right tabular-nums">{fmtMoney(r.amount)}</td>
                    {model.mode === 'TAX' && (
                      <td className="py-2 text-right text-neutral-600">{r.gstPercent}%</td>
                    )}
                    <td className="py-2 text-right tabular-nums font-semibold">
                      {fmtMoney(
                        r.amount + (model.mode === 'TAX' ? (r.amount * r.gstPercent) / 100 : 0)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ======= TOTALS ======= */}
          <div className="flex justify-end pt-3">
            <div className="w-[70mm] text-[11px]">
              {model.mode === 'TAX' ? (
                <>
                  <Row label="Taxable Value" value={fmtMoney(model.taxableTotal)} />
                  {model.taxLines.map(l => (
                    <Row key={l.label} label={l.label} value={fmtMoney(l.amount)} />
                  ))}
                  {opts.show.roundOff && Math.abs(model.roundOff) > 0.004 && (
                    <Row label="Round Off" value={fmtMoney(model.roundOff)} />
                  )}
                  <div className="flex justify-between border-t border-neutral-900 mt-1.5 pt-1.5 text-sm font-bold">
                    <span>Grand Total</span>
                    <span className="tabular-nums">₹ {fmtMoney(model.grandTotal)}</span>
                  </div>
                </>
              ) : (
                <>
                  <Row label="Sub Total" value={fmtMoney(model.rawTotal)} />
                  {opts.show.roundOff && Math.abs(model.roundOff) > 0.004 && (
                    <Row label="Round Off" value={fmtMoney(model.roundOff)} />
                  )}
                  <div className="flex justify-between border-t border-neutral-900 mt-1.5 pt-1.5 text-sm font-bold">
                    <span>Grand Total</span>
                    <span className="tabular-nums">₹ {fmtMoney(model.grandTotal)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ======= AMOUNT IN WORDS ======= */}
          <div className="mt-3 pt-3 border-t border-neutral-200 text-[11px]">
            <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-semibold mr-1.5">
              Amount in words:
            </span>
            <span className="font-medium text-neutral-900">{model.amountWords} Only</span>
            {opts.show.taxWords && model.mode === 'TAX' && model.taxTotal > 0 && (
              <div className="mt-1 text-[10px] text-neutral-600 italic">
                Total tax: {model.taxWords} Only
              </div>
            )}
          </div>

          {/* ======= HSN SUMMARY ======= */}
          {opts.show.hsnSummary && model.hsnRows.length > 0 && model.mode === 'TAX' && (
            <div className="mt-4 pt-3 border-t border-neutral-200">
              <div className="text-[9px] uppercase tracking-[0.15em] text-neutral-500 font-semibold mb-2">
                HSN / SAC Summary
              </div>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-neutral-300 text-[9px] uppercase tracking-wider text-neutral-500">
                    <th className="text-left py-1.5 font-semibold">HSN</th>
                    <th className="text-right py-1.5 font-semibold">Taxable</th>
                    {model.isIntraState ? (
                      <>
                        <th className="text-right py-1.5 font-semibold">CGST %</th>
                        <th className="text-right py-1.5 font-semibold">CGST ₹</th>
                        <th className="text-right py-1.5 font-semibold">SGST %</th>
                        <th className="text-right py-1.5 font-semibold">SGST ₹</th>
                      </>
                    ) : (
                      <>
                        <th className="text-right py-1.5 font-semibold">IGST %</th>
                        <th className="text-right py-1.5 font-semibold">IGST ₹</th>
                      </>
                    )}
                    <th className="text-right py-1.5 font-semibold">Total Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {model.hsnRows.map((h, i) => (
                    <tr key={i} className="border-b border-neutral-100">
                      <td className="py-1.5 font-mono">{h.hsn}</td>
                      <td className="py-1.5 text-right tabular-nums">{fmtMoney(h.taxable)}</td>
                      {model.isIntraState ? (
                        <>
                          <td className="py-1.5 text-right text-neutral-600">{h.cgstRate}%</td>
                          <td className="py-1.5 text-right tabular-nums">
                            {fmtMoney(h.cgstAmt)}
                          </td>
                          <td className="py-1.5 text-right text-neutral-600">{h.sgstRate}%</td>
                          <td className="py-1.5 text-right tabular-nums">
                            {fmtMoney(h.sgstAmt)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-1.5 text-right text-neutral-600">{h.igstRate}%</td>
                          <td className="py-1.5 text-right tabular-nums">
                            {fmtMoney(h.igstAmt)}
                          </td>
                        </>
                      )}
                      <td className="py-1.5 text-right tabular-nums font-semibold">
                        {fmtMoney(h.totalTax)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ======= REMARKS ======= */}
          {model.remarks && (
            <div className="mt-4 pt-3 border-t border-neutral-200 text-[11px]">
              <span className="text-[9px] uppercase tracking-wider text-neutral-500 font-semibold mr-1.5">
                Remarks:
              </span>
              <span className="text-neutral-700">{model.remarks}</span>
            </div>
          )}

          {/* ======= BANK + UPI + DECLARATION ======= */}
          {(opts.show.bank || opts.show.upi || opts.show.declaration) && (
            <div className="mt-4 pt-3 border-t border-neutral-200 grid grid-cols-2 gap-6 text-[10px]">
              {(opts.show.bank || opts.show.upi) && (
                <div>
                  <div className="text-[9px] uppercase tracking-[0.15em] text-neutral-500 font-semibold mb-1.5">
                    Bank Details
                  </div>
                  {(settings as any).bankName && (
                    <div className="text-neutral-700">
                      <span className="text-neutral-500">Bank: </span>
                      <span className="font-medium text-neutral-900">
                        {(settings as any).bankName}
                      </span>
                    </div>
                  )}
                  {(settings as any).bankAccount && (
                    <div className="text-neutral-700 font-mono">
                      <span className="text-neutral-500 font-sans">A/c: </span>
                      {(settings as any).bankAccount}
                    </div>
                  )}
                  {(settings as any).bankIfsc && (
                    <div className="text-neutral-700 font-mono">
                      <span className="text-neutral-500 font-sans">IFSC: </span>
                      {(settings as any).bankIfsc}
                    </div>
                  )}
                  {(settings as any).bankBranch && (
                    <div className="text-neutral-700">
                      <span className="text-neutral-500">Branch: </span>
                      {(settings as any).bankBranch}
                    </div>
                  )}
                  {opts.show.upi && (settings as any).upiId && (
                    <div className="mt-1.5 text-neutral-700">
                      <span className="text-neutral-500">UPI: </span>
                      <span className="font-mono font-medium text-neutral-900">
                        {(settings as any).upiId}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {opts.show.declaration && (
                <div>
                  <div className="text-[9px] uppercase tracking-[0.15em] text-neutral-500 font-semibold mb-1.5">
                    Declaration
                  </div>
                  <p className="text-neutral-600 leading-snug">{DEFAULT_DECLARATION}</p>
                  <p className="text-neutral-500 mt-1.5">
                    Subject to <span className="font-medium">{opts.jurisdiction}</span>{' '}
                    jurisdiction.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ======= SIGNATURE ======= */}
          <div className="mt-6 pt-6 grid grid-cols-2 gap-6">
            <div>
              <div className="border-t border-neutral-400 pt-1.5 text-[10px] text-neutral-600">
                Customer Signature
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-neutral-500 mb-6">For</div>
              <div className="text-[11px] font-semibold text-neutral-900">
                {model.seller.name}
              </div>
              <div className="border-t border-neutral-400 pt-1.5 text-[10px] text-neutral-600 mt-6">
                Authorised Signatory
              </div>
            </div>
          </div>

          {/* ======= FOOTER ======= */}
          <div className="mt-4 pt-3 border-t border-neutral-200 text-center text-[9px] text-neutral-400 tracking-wider uppercase">
            This is a computer-generated invoice · {model.invoiceNo}
          </div>
        </div>
      </div>
    </div>
  );
};

/* Small helper for total lines */
const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between py-0.5">
    <span className="text-neutral-600">{label}</span>
    <span className="tabular-nums text-neutral-900">{value}</span>
  </div>
);
