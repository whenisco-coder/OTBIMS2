import React from 'react';
import { Scissors } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import type { Order } from '../../types';
import {
  type InvoiceOptions,
  type InvoiceModel,
  buildInvoiceModel,
  fmtMoney,
} from '../../utils/invoiceModel';
import { CourierLabelBlock } from '../shipping/CourierLabelBlock';

interface CombinedSheetProps {
  order: Order;
  opts: InvoiceOptions;
  courierName: string;
  awbNumber: string;
  hideBarcode?: boolean;
  /** Ref forwarded to the outer sheet wrapper so measurement / PDF capture works. */
  sheetRef?: React.Ref<HTMLDivElement>;
}

export const CombinedSheet: React.FC<CombinedSheetProps> = ({
  order,
  opts,
  courierName,
  awbNumber,
  hideBarcode,
  sheetRef,
}) => {
  const { settings, products } = useStore();
  const model: InvoiceModel = React.useMemo(
    () => buildInvoiceModel(order, settings as any, products, opts),
    [order, settings, products, opts]
  );

  return (
    <div
      ref={sheetRef}
      className="combined-sheet bg-white text-neutral-900 border-2 border-black"
      style={{ width: '148mm', fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      {/* ============================================================ */}
      {/*  INVOICE HALF                                                */}
      {/* ============================================================ */}
      <div className="p-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 pb-2 border-b border-neutral-300">
          <div className="min-w-0">
            <div className="font-bold tracking-tight text-sm">{model.seller.name}</div>
            {model.seller.addressLines.map((l, i) => (
              <div key={i} className="text-[9px] text-neutral-600 leading-snug">{l}</div>
            ))}
            <div className="text-[9px] text-neutral-600 mt-0.5 font-mono">
              {model.seller.gstin && <>GSTIN: {model.seller.gstin} · </>}
              {model.seller.stateName} ({model.seller.stateCode})
            </div>
            {model.seller.phone && (
              <div className="text-[9px] text-neutral-600">Ph: {model.seller.phone}</div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="inline-block border border-neutral-900 px-2 py-0.5 font-bold tracking-[0.15em] uppercase text-[10px]">
              {model.title}
            </div>
          </div>
        </div>

        {/* Meta strip */}
        <div className="grid grid-cols-2 gap-x-3 py-1.5 border-b border-neutral-200 text-[9px]">
          <div className="flex justify-between">
            <span className="text-neutral-500">Invoice No.</span>
            <span className="font-mono font-semibold">{model.invoiceNo}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Dated</span>
            <span className="font-mono font-semibold">{model.dated}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Place of Supply</span>
            <span className="font-semibold">{model.buyer.stateName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Reverse Charge</span>
            <span className="font-semibold">No</span>
          </div>
        </div>

        {/* Bill To + Ship To */}
        <div className={`grid ${model.consignee ? 'grid-cols-2' : 'grid-cols-1'} gap-3 py-2 border-b border-neutral-200`}>
          <div>
            <div className="text-[8px] uppercase tracking-wider text-neutral-500 font-semibold mb-0.5">
              Bill To
            </div>
            <div className="text-[11px] font-bold">{model.buyer.name}</div>
            {model.buyer.addressLines.map((l, i) => (
              <div key={i} className="text-[9px] text-neutral-700 leading-snug">{l}</div>
            ))}
            {opts.show.buyerGstin && model.buyer.gstin && (
              <div className="text-[9px] font-mono font-semibold mt-0.5">
                GSTIN: {model.buyer.gstin}
              </div>
            )}
            {model.buyer.phone && (
              <div className="text-[9px] font-mono">Ph: {model.buyer.phone}</div>
            )}
          </div>
          {model.consignee && (
            <div>
              <div className="text-[8px] uppercase tracking-wider text-neutral-500 font-semibold mb-0.5">
                Ship To
              </div>
              <div className="text-[11px] font-bold">{model.consignee.name}</div>
              {model.consignee.addressLines.map((l, i) => (
                <div key={i} className="text-[9px] text-neutral-700 leading-snug">{l}</div>
              ))}
              <div className="text-[9px] text-neutral-700">
                {model.consignee.stateName} ({model.consignee.stateCode})
              </div>
            </div>
          )}
        </div>

        {/* Items table — compact */}
        <div className="pt-1.5">
          <table className="w-full text-[9px]">
            <thead>
              <tr className="border-b border-neutral-900 text-[8px] uppercase tracking-wider text-neutral-600">
                <th className="text-left py-1 font-semibold w-4">#</th>
                <th className="text-left py-1 font-semibold">Description</th>
                <th className="text-left py-1 font-semibold w-10">HSN</th>
                <th className="text-right py-1 font-semibold w-6">Qty</th>
                <th className="text-right py-1 font-semibold w-12">Rate</th>
                <th className="text-right py-1 font-semibold w-14">Amount</th>
              </tr>
            </thead>
            <tbody>
              {model.rows.map(r => (
                <tr key={r.sl} className="border-b border-neutral-100 align-top">
                  <td className="py-1 text-neutral-500">{r.sl}</td>
                  <td className="py-1 pr-1">
                    <div className="font-medium text-neutral-900 leading-tight">{r.name}</div>
                    {opts.show.itemDetails && r.detail && (
                      <div className="text-[8px] text-neutral-500">{r.detail}</div>
                    )}
                  </td>
                  <td className="py-1 font-mono text-neutral-600">{r.hsn}</td>
                  <td className="py-1 text-right tabular-nums">{r.qty}</td>
                  <td className="py-1 text-right tabular-nums">{fmtMoney(r.rate)}</td>
                  <td className="py-1 text-right tabular-nums font-semibold">
                    {fmtMoney(
                      r.amount + (model.mode === 'TAX' ? (r.amount * r.gstPercent) / 100 : 0)
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end pt-1.5">
          <div className="w-[55mm] text-[9px]">
            {model.mode === 'TAX' ? (
              <>
                <LineRow label="Taxable" value={fmtMoney(model.taxableTotal)} />
                {model.taxLines.map(l => (
                  <LineRow key={l.label} label={l.label} value={fmtMoney(l.amount)} />
                ))}
                {opts.show.roundOff && Math.abs(model.roundOff) > 0.004 && (
                  <LineRow label="Round Off" value={fmtMoney(model.roundOff)} />
                )}
                <div className="flex justify-between border-t border-neutral-900 mt-1 pt-1 text-[11px] font-bold">
                  <span>Grand Total</span>
                  <span className="tabular-nums">₹ {fmtMoney(model.grandTotal)}</span>
                </div>
              </>
            ) : (
              <>
                <LineRow label="Sub Total" value={fmtMoney(model.rawTotal)} />
                <div className="flex justify-between border-t border-neutral-900 mt-1 pt-1 text-[11px] font-bold">
                  <span>Grand Total</span>
                  <span className="tabular-nums">₹ {fmtMoney(model.grandTotal)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Amount in words */}
        <div className="mt-1.5 pt-1.5 border-t border-neutral-200 text-[9px]">
          <span className="text-[8px] uppercase tracking-wider text-neutral-500 font-semibold mr-1">
            In words:
          </span>
          <span className="font-medium">{model.amountWords} Only</span>
        </div>
      </div>

      {/* CUT LINE + LABEL — appended in 3B */}
            {/* ============================================================ */}
      {/*  CUT LINE                                                    */}
      {/* ============================================================ */}
      <div className="relative flex items-center justify-center px-3 py-1 bg-white">
        <div className="flex-1 border-t border-dashed border-neutral-500" />
        <div className="mx-2 flex items-center gap-1 text-neutral-500">
          <Scissors className="w-3 h-3" />
          <span className="text-[8px] uppercase tracking-wider font-semibold">
            Cut here
          </span>
        </div>
        <div className="flex-1 border-t border-dashed border-neutral-500" />
      </div>

      {/* ============================================================ */}
      {/*  LABEL HALF                                                  */}
      {/* ============================================================ */}
      <div className="border-t-2 border-black">
        <CourierLabelBlock
          order={order}
          courierName={courierName}
          awbNumber={awbNumber}
          hideBarcode={hideBarcode}
          compact
          hideReturnTo
        />
      </div>
    </div>
  );
};

/* Compact line-row helper used only inside CombinedSheet */
const LineRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between py-0.5">
    <span className="text-neutral-600">{label}</span>
    <span className="tabular-nums text-neutral-900">{value}</span>
  </div>
);
