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

export const TallyClassicTemplate: React.FC<Props> = ({ order, model, opts, settings }) => {
  return (
    <div className="tally-classic text-black" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* ===================== TITLE ===================== */}
      <div className="text-center border-b-2 border-black pb-1.5">
        <div className="text-sm font-bold tracking-[0.2em] uppercase">Tax Invoice</div>
        <div className="text-[8px] italic text-neutral-700 mt-0.5">
          (Under Section 31 of CGST Act, 2017 · Eligible for Input Tax Credit)
        </div>
      </div>

      {/* ===================== HEADER: SELLER + META ===================== */}
      <div className="grid grid-cols-2 border-b-2 border-black">
        {/* Seller */}
        <div className="p-2 border-r-2 border-black">
          <div className="text-[7px] uppercase tracking-wider text-neutral-600 font-semibold mb-1">
            Issued by (Seller)
          </div>
          <div className="text-[11px] font-bold uppercase">{model.seller.name}</div>
          {model.seller.addressLines.map((l, i) => (
            <div key={i} className="text-[9px] leading-snug">{l}</div>
          ))}
          {model.seller.gstin && (
            <div className="text-[9px] font-mono mt-0.5">
              <span className="text-neutral-600 font-sans">GSTIN: </span>
              <span className="font-bold">{model.seller.gstin}</span>
            </div>
          )}
          <div className="text-[9px]">
            <span className="text-neutral-600">State: </span>
            <span className="font-semibold">
              {model.seller.stateName} (State Code {model.seller.stateCode})
            </span>
          </div>
          {model.seller.phone && (
            <div className="text-[9px]">
              <span className="text-neutral-600">Phone: </span>
              <span className="font-mono">{model.seller.phone}</span>
            </div>
          )}
        </div>

        {/* Meta */}
        <div className="p-2 text-[9px]">
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
            <div className="text-neutral-600 font-semibold">Invoice No:</div>
            <div className="font-mono font-bold text-right">{model.invoiceNo}</div>

            <div className="text-neutral-600 font-semibold">Dated:</div>
            <div className="font-mono font-bold text-right">{model.dated}</div>

            {order.orderNo && (
              <>
                <div className="text-neutral-600 font-semibold">Order Ref:</div>
                <div className="font-mono font-bold text-right">{order.orderNo}</div>
              </>
            )}

            <div className="text-neutral-600 font-semibold">Place of Supply:</div>
            <div className="text-right font-bold">
              {model.buyer.stateName} (State Code {model.buyer.stateCode})
            </div>

            <div className="text-neutral-600 font-semibold">Customer Type:</div>
            <div className="text-right font-bold">
              {order.customerType}
              {order.customerGstin ? ' (B2B Registered)' : ''}
            </div>

            <div className="text-neutral-600 font-semibold">Reverse Charge:</div>
            <div className="text-right">No</div>
          </div>
        </div>
      </div>

      {/* ===================== BILLED TO ===================== */}
      <div className="border-b-2 border-black p-2">
        <div className="text-[7px] uppercase tracking-wider text-neutral-600 font-semibold mb-0.5">
          Billed To (Buyer)
        </div>
        <div className="text-[11px] font-bold uppercase">{model.buyer.name}</div>
        {model.buyer.addressLines.map((l, i) => (
          <div key={i} className="text-[9px] leading-snug">{l}</div>
        ))}
        {model.buyer.phone && (
          <div className="text-[9px]">
            <span className="text-neutral-600">Phone: </span>
            <span className="font-mono">{model.buyer.phone}</span>
          </div>
        )}
        {opts.show.buyerGstin && model.buyer.gstin && (
          <div className="text-[9px] font-mono mt-0.5">
            <span className="text-neutral-600 font-sans">GSTIN / UIN: </span>
            <span className="font-bold">{model.buyer.gstin}</span>
          </div>
        )}
      </div>

      {/* ===================== SHIPPED TO ===================== */}
      {model.consignee && (
        <div className="border-b-2 border-black p-2">
          <div className="text-[7px] uppercase tracking-wider text-neutral-600 font-semibold mb-0.5">
            Shipped To (Consignee)
          </div>
          <div className="text-[11px] font-bold uppercase">{model.consignee.name}</div>
          {model.consignee.addressLines.map((l, i) => (
            <div key={i} className="text-[9px] leading-snug">{l}</div>
          ))}
          {(order.courierName || order.awbNumber) && (
            <div className="text-[8px] mt-0.5 italic">
              Dispatch via: {order.courierName || '—'}
              {order.awbNumber ? ` (AWB: ${order.awbNumber})` : ''}
            </div>
          )}
        </div>
      )}
            {/* ===================== ITEMS ===================== */}
      <div className="border-b-2 border-black">
        <table className="w-full text-[8px]">
          <thead>
            <tr className="border-b border-black bg-neutral-100 print:bg-transparent">
              <th className="text-left py-1 px-1 font-bold border-r border-black w-5">S.No</th>
              <th className="text-left py-1 px-1 font-bold border-r border-black">Description of Goods</th>
              <th className="text-left py-1 px-1 font-bold border-r border-black w-10">HSN</th>
              <th className="text-right py-1 px-1 font-bold border-r border-black w-7">Qty</th>
              <th className="text-right py-1 px-1 font-bold border-r border-black w-12">Rate (₹)</th>
              <th className="text-right py-1 px-1 font-bold border-r border-black w-14">Taxable (₹)</th>
              <th className="text-right py-1 px-1 font-bold border-r border-black w-8">GST%</th>
              <th className="text-right py-1 px-1 font-bold w-16">Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            {model.rows.map(r => (
              <tr key={r.sl} className="border-b border-neutral-300 align-top">
                <td className="py-1 px-1 border-r border-black text-center">{r.sl}</td>
                <td className="py-1 px-1 border-r border-black">
                  <div className="font-semibold leading-tight">{r.name}</div>
                  {r.detail && (
                    <div className="text-[7px] text-neutral-600 leading-tight mt-0.5">{r.detail}</div>
                  )}
                </td>
                <td className="py-1 px-1 border-r border-black font-mono">{r.hsn}</td>
                <td className="py-1 px-1 border-r border-black text-right tabular-nums">
                  {r.qty} {r.unit}
                </td>
                <td className="py-1 px-1 border-r border-black text-right tabular-nums">
                  {fmtMoney(r.rate)}
                </td>
                <td className="py-1 px-1 border-r border-black text-right tabular-nums">
                  {fmtMoney(r.amount)}
                </td>
                <td className="py-1 px-1 border-r border-black text-right">{r.gstPercent}%</td>
                <td className="py-1 px-1 text-right tabular-nums font-bold">
                  {fmtMoney(r.amount + (model.mode === 'TAX' ? (r.amount * r.gstPercent) / 100 : 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===================== AMOUNT IN WORDS + TOTALS ===================== */}
      <div className="grid grid-cols-2 border-b-2 border-black">
        <div className="p-2 border-r-2 border-black">
          <div className="text-[7px] uppercase tracking-wider text-neutral-600 font-semibold mb-0.5">
            Amount in Words (INR):
          </div>
          <div className="text-[9px] font-bold">{model.amountWords} Only</div>
          {model.remarks && (
            <div className="text-[8px] italic mt-1">
              <span className="font-semibold not-italic">Remarks: </span>
              {model.remarks}
            </div>
          )}
          <div className="text-[7px] text-neutral-600 mt-2 leading-tight">
            * Certified that the particulars given above are true and correct. Input Tax Credit is
            admissible to registered recipient.
          </div>
          <div className="text-[7px] text-neutral-600 mt-1">
            Subject to <span className="font-semibold">{opts.jurisdiction}</span> jurisdiction.
          </div>
        </div>

        <div className="p-2 text-[9px]">
          <div className="flex justify-between py-0.5">
            <span className="text-neutral-700">Taxable Subtotal:</span>
            <span className="tabular-nums font-semibold">₹{fmtMoney(model.taxableTotal)}</span>
          </div>
          {model.taxLines.map(l => (
            <div key={l.label} className="flex justify-between py-0.5">
              <span className="text-neutral-700">{l.label}:</span>
              <span className="tabular-nums font-semibold">₹{fmtMoney(l.amount)}</span>
            </div>
          ))}
          {opts.show.roundOff && Math.abs(model.roundOff) > 0.004 && (
            <div className="flex justify-between py-0.5">
              <span className="text-neutral-700">Round-off:</span>
              <span className="tabular-nums font-semibold">₹{fmtMoney(model.roundOff)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-black mt-1.5 pt-1.5">
            <span className="font-bold uppercase tracking-wide">Net Payable:</span>
            <span className="tabular-nums text-[12px] font-black">
              ₹{fmtMoney(model.grandTotal)}
            </span>
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-neutral-700">Payment Mode:</span>
            <span className="font-semibold">{order.paymentStatus}</span>
          </div>
        </div>
      </div>

      {/* ===================== HSN SUMMARY ===================== */}
      {opts.show.hsnSummary && model.hsnRows.length > 0 && (
        <div className="border-b-2 border-black">
          <div className="p-1 bg-neutral-100 print:bg-transparent text-[7px] uppercase tracking-wider text-neutral-700 font-bold border-b border-black">
            HSN / SAC Tax Analysis
          </div>
          <table className="w-full text-[7px]">
            <thead>
              <tr className="border-b border-black">
                <th className="text-left py-0.5 px-1 font-bold border-r border-black">HSN</th>
                <th className="text-right py-0.5 px-1 font-bold border-r border-black">Taxable (₹)</th>
                {model.isIntraState ? (
                  <>
                    <th className="text-right py-0.5 px-1 font-bold border-r border-black">CGST Rate</th>
                    <th className="text-right py-0.5 px-1 font-bold border-r border-black">CGST Amt (₹)</th>
                    <th className="text-right py-0.5 px-1 font-bold border-r border-black">SGST Rate</th>
                    <th className="text-right py-0.5 px-1 font-bold border-r border-black">SGST Amt (₹)</th>
                  </>
                ) : (
                  <>
                    <th className="text-right py-0.5 px-1 font-bold border-r border-black">IGST Rate</th>
                    <th className="text-right py-0.5 px-1 font-bold border-r border-black">IGST Amt (₹)</th>
                  </>
                )}
                <th className="text-right py-0.5 px-1 font-bold">Total Tax (₹)</th>
              </tr>
            </thead>
            <tbody>
              {model.hsnRows.map((h, i) => (
                <tr key={i} className="border-b border-neutral-300">
                  <td className="py-0.5 px-1 border-r border-black font-mono">{h.hsn}</td>
                  <td className="py-0.5 px-1 border-r border-black text-right tabular-nums">
                    {fmtMoney(h.taxable)}
                  </td>
                  {model.isIntraState ? (
                    <>
                      <td className="py-0.5 px-1 border-r border-black text-right">{h.cgstRate}%</td>
                      <td className="py-0.5 px-1 border-r border-black text-right tabular-nums">
                        {fmtMoney(h.cgstAmt)}
                      </td>
                      <td className="py-0.5 px-1 border-r border-black text-right">{h.sgstRate}%</td>
                      <td className="py-0.5 px-1 border-r border-black text-right tabular-nums">
                        {fmtMoney(h.sgstAmt)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-0.5 px-1 border-r border-black text-right">{h.igstRate}%</td>
                      <td className="py-0.5 px-1 border-r border-black text-right tabular-nums">
                        {fmtMoney(h.igstAmt)}
                      </td>
                    </>
                  )}
                  <td className="py-0.5 px-1 text-right tabular-nums font-bold">
                    {fmtMoney(h.totalTax)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ===================== BANK + SIGNATURE ===================== */}
      {(opts.show.bank || opts.show.upi) && (
        <div className="grid grid-cols-[1fr_auto] border-b-2 border-black">
          <div className="p-2">
            <div className="text-[7px] uppercase tracking-wider text-neutral-600 font-semibold mb-0.5">
              Bank & Settlement
            </div>
            {(settings as any).bankName && (
              <div className="text-[8px]">
                <span className="text-neutral-600">Bank: </span>
                <span className="font-semibold">{(settings as any).bankName}</span>
              </div>
            )}
            {(settings as any).ifscCode && (
              <div className="text-[8px] font-mono">
                <span className="text-neutral-600 font-sans">IFSC: </span>
                {(settings as any).ifscCode}
              </div>
            )}
            {(settings as any).accountNumber && (
              <div className="text-[8px] font-mono">
                <span className="text-neutral-600 font-sans">A/c: </span>
                {(settings as any).accountNumber}
              </div>
            )}
            {opts.show.upi && (settings as any).upiId && (
              <div className="text-[8px] mt-1">
                <span className="text-neutral-600">UPI: </span>
                <span className="font-mono font-semibold">{(settings as any).upiId}</span>
              </div>
            )}
          </div>
          <div className="p-2 text-right border-l-2 border-black min-w-[45mm]">
            <div className="text-[8px] mb-6">
              For <span className="font-bold uppercase">{model.seller.name}</span>
            </div>
            <div className="border-t border-black pt-1 text-[8px] uppercase tracking-wider">
              Authorised Signatory
            </div>
          </div>
        </div>
      )}

      {/* ===================== FOOTER ===================== */}
      <div className="text-center text-[7px] text-neutral-500 py-1 uppercase tracking-wider">
        This is a computer-generated invoice · {model.invoiceNo}
      </div>
    </div>
  );
};
