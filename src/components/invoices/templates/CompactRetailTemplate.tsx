import React from 'react';
import type { Order, BusinessSettings } from '../../../types';
import type { InvoiceModel, InvoiceOptions } from '../../../utils/invoiceModel';
import { fmtMoney } from '../../../utils/invoiceModel';

interface Props {
  order: Order;
  model: InvoiceModel;
  opts: InvoiceOptions;
  settings: BusinessSettings;
}

export const CompactRetailTemplate: React.FC<Props> = ({ order, model, opts, settings }) => {
  return (
    <div className="compact-retail text-black" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* ===================== HEADER ===================== */}
      <div className="text-center pb-2 border-b border-black">
        <div className="font-black tracking-tight text-sm uppercase">{model.seller.name}</div>
        {model.seller.addressLines.map((l, i) => (
          <div key={i} className="text-[9px] leading-tight">{l}</div>
        ))}
        {model.seller.gstin && (
          <div className="text-[9px] font-mono">
            GSTIN: {model.seller.gstin}
          </div>
        )}
        {model.seller.phone && (
          <div className="text-[9px] font-mono">Ph: {model.seller.phone}</div>
        )}
      </div>

      {/* ===================== TITLE ===================== */}
      <div className="text-center py-1 border-b border-black">
        <div className="text-xs font-black tracking-widest uppercase">
          {model.title}
        </div>
        {model.subtitle && (
          <div className="text-[8px] italic text-neutral-700">{model.subtitle}</div>
        )}
      </div>

      {/* ===================== META ===================== */}
      <div className="grid grid-cols-2 gap-x-2 py-1 border-b border-black text-[9px]">
        <div className="flex justify-between">
          <span className="text-neutral-700">No:</span>
          <span className="font-mono font-bold">{model.invoiceNo}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-700">Date:</span>
          <span className="font-mono font-bold">{model.dated}</span>
        </div>
      </div>

      {/* ===================== CUSTOMER ===================== */}
      <div className="py-1.5 border-b border-black">
        <div className="text-[8px] uppercase tracking-wider text-neutral-700 font-bold mb-0.5">
          Customer
        </div>
        <div className="text-[12px] font-black leading-tight uppercase">
          {model.buyer.name}
        </div>
        {model.buyer.phone && (
          <div className="text-[11px] font-bold font-mono">
            {model.buyer.phone}
          </div>
        )}
        {model.consignee && (
          <div className="text-[9px] text-neutral-800 leading-snug mt-0.5">
            Ship to: {model.consignee.addressLines.join(', ')}
          </div>
        )}
        {!model.consignee && model.buyer.addressLines.length > 0 && (
          <div className="text-[9px] text-neutral-800 leading-snug mt-0.5">
            {model.buyer.addressLines.join(', ')}
          </div>
        )}
        {opts.show.buyerGstin && model.buyer.gstin && (
          <div className="text-[9px] font-mono font-bold mt-0.5">
            GSTIN: {model.buyer.gstin}
          </div>
        )}
      </div>
            {/* ===================== ITEMS ===================== */}
      <table className="w-full text-[9px] mt-1">
        <thead>
          <tr className="border-b border-black">
            <th className="text-left py-0.5 font-black w-4">#</th>
            <th className="text-left py-0.5 font-black">Item</th>
            <th className="text-right py-0.5 font-black w-6">Qty</th>
            <th className="text-right py-0.5 font-black w-12">Rate</th>
            <th className="text-right py-0.5 font-black w-14">Amount</th>
          </tr>
        </thead>
        <tbody>
          {model.rows.map(r => (
            <tr key={r.sl} className="border-b border-neutral-300 align-top">
              <td className="py-0.5">{r.sl}</td>
              <td className="py-0.5 pr-1">
                <div className="font-bold leading-tight">{r.name}</div>
                {opts.show.itemDetails && r.detail && (
                  <div className="text-[7px] text-neutral-600 leading-tight">{r.detail}</div>
                )}
              </td>
              <td className="py-0.5 text-right tabular-nums font-bold">{r.qty}</td>
              <td className="py-0.5 text-right tabular-nums">{fmtMoney(r.rate)}</td>
              <td className="py-0.5 text-right tabular-nums font-bold">
                {fmtMoney(r.amount + (model.mode === 'TAX' ? (r.amount * r.gstPercent) / 100 : 0))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ===================== TOTALS ===================== */}
      <div className="mt-1.5 pt-1.5 border-t-2 border-black">
        {model.mode === 'TAX' ? (
          <>
            <div className="flex justify-between text-[9px]">
              <span>Taxable</span>
              <span className="tabular-nums">₹{fmtMoney(model.taxableTotal)}</span>
            </div>
            {model.taxLines.map(l => (
              <div key={l.label} className="flex justify-between text-[9px]">
                <span>{l.label}</span>
                <span className="tabular-nums">₹{fmtMoney(l.amount)}</span>
              </div>
            ))}
            {opts.show.roundOff && Math.abs(model.roundOff) > 0.004 && (
              <div className="flex justify-between text-[9px]">
                <span>Round Off</span>
                <span className="tabular-nums">₹{fmtMoney(model.roundOff)}</span>
              </div>
            )}
          </>
        ) : (
          <div className="flex justify-between text-[9px]">
            <span>Sub Total</span>
            <span className="tabular-nums">₹{fmtMoney(model.rawTotal)}</span>
          </div>
        )}

        <div className="flex justify-between items-baseline border-t border-black mt-1 pt-1">
          <span className="text-xs font-black uppercase tracking-wide">Total</span>
          <span className="text-base font-black tabular-nums">
            ₹{fmtMoney(model.grandTotal)}
          </span>
        </div>
      </div>

      {/* ===================== PAYMENT MODE ===================== */}
      <div className="mt-1.5 pt-1.5 border-t border-black text-[9px] flex justify-between">
        <span className="text-neutral-700 uppercase tracking-wider">Payment</span>
        <span className="font-black uppercase">
          {order.paymentStatus === 'COD' ? 'CASH ON DELIVERY' : order.paymentStatus}
        </span>
      </div>

      {/* ===================== AMOUNT IN WORDS (compact) ===================== */}
      <div className="mt-1 text-[8px] italic text-neutral-700 leading-tight">
        <span className="font-bold not-italic uppercase">In words: </span>
        {model.amountWords} Only
      </div>

      {/* ===================== HSN SUMMARY (optional, always compact) ===================== */}
      {opts.show.hsnSummary && model.hsnRows.length > 0 && model.mode === 'TAX' && (
        <div className="mt-2 pt-1.5 border-t border-dashed border-neutral-400">
          <div className="text-[7px] uppercase tracking-wider text-neutral-700 font-bold mb-0.5">
            HSN Summary
          </div>
          <table className="w-full text-[7px]">
            <thead>
              <tr className="border-b border-neutral-400">
                <th className="text-left py-0.5 font-bold">HSN</th>
                <th className="text-right py-0.5 font-bold">Taxable</th>
                {model.isIntraState ? (
                  <>
                    <th className="text-right py-0.5 font-bold">CGST</th>
                    <th className="text-right py-0.5 font-bold">SGST</th>
                  </>
                ) : (
                  <th className="text-right py-0.5 font-bold">IGST</th>
                )}
                <th className="text-right py-0.5 font-bold">Tax</th>
              </tr>
            </thead>
            <tbody>
              {model.hsnRows.map((h, i) => (
                <tr key={i}>
                  <td className="py-0.5 font-mono">{h.hsn}</td>
                  <td className="py-0.5 text-right tabular-nums">{fmtMoney(h.taxable)}</td>
                  {model.isIntraState ? (
                    <>
                      <td className="py-0.5 text-right tabular-nums">{fmtMoney(h.cgstAmt)}</td>
                      <td className="py-0.5 text-right tabular-nums">{fmtMoney(h.sgstAmt)}</td>
                    </>
                  ) : (
                    <td className="py-0.5 text-right tabular-nums">{fmtMoney(h.igstAmt)}</td>
                  )}
                  <td className="py-0.5 text-right tabular-nums font-bold">
                    {fmtMoney(h.totalTax)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ===================== SIGNATURE ===================== */}
      <div className="mt-3 pt-2 border-t border-black grid grid-cols-2 gap-3">
        <div>
          <div className="border-t border-black pt-0.5 text-[8px] text-neutral-700">
            Customer Sign
          </div>
        </div>
        <div className="text-right">
          <div className="text-[8px] mb-3">For {model.seller.name}</div>
          <div className="border-t border-black pt-0.5 text-[8px] uppercase tracking-wider">
            Authorised Signatory
          </div>
        </div>
      </div>

      {/* ===================== FOOTER ===================== */}
      <div className="mt-1.5 pt-1 text-center text-[7px] text-neutral-500 tracking-wider uppercase">
        Thank you · Visit again
      </div>
    </div>
  );
};
