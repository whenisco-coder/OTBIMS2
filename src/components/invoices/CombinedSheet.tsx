import React from 'react';
import { Scissors } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import type { Order } from '../../types';
import {
  type InvoiceOptions,
  type InvoiceModel,
  buildInvoiceModel,
  fmtMoney,
  DEFAULT_DECLARATION,
} from '../../utils/invoiceModel';
import { CourierLabelBlock } from '../shipping/CourierLabelBlock';

export interface CombinedConfig {
  showCutLine: boolean;
  showSignature: boolean;
  showBank: boolean;
  showUpi: boolean;
  showDeclaration: boolean;
  showRemarks: boolean;
  labelShowPaymentBanner: boolean;
  labelShowReturnTo: boolean;
  labelShowContents: boolean;
  labelShowBattery: boolean;
  showHsnColumn: boolean;
}

export const DEFAULT_COMBINED_CONFIG: CombinedConfig = {
  showCutLine: false,
  showSignature: true,
  showBank: false,
  showUpi: false,
  showDeclaration: false,
  showRemarks: false,
  labelShowPaymentBanner: false,
  labelShowReturnTo: true,
  labelShowContents: true,
  labelShowBattery: true,
  showHsnColumn: true,
};

interface CombinedSheetProps {
  order: Order;
  opts: InvoiceOptions;
  courierName: string;
  awbNumber: string;
  config?: Partial<CombinedConfig>;
  hideBarcode?: boolean;
  sheetRef?: React.Ref<HTMLDivElement>;
}

export const CombinedSheet: React.FC<CombinedSheetProps> = ({
  order,
  opts,
  courierName,
  awbNumber,
  config,
  hideBarcode = false,
  sheetRef,
}) => {
  const { settings, products } = useStore();
  const cfg: CombinedConfig = { ...DEFAULT_COMBINED_CONFIG, ...(config || {}) };

  const model: InvoiceModel = React.useMemo(
    () => buildInvoiceModel(order, settings as any, products, opts),
    [order, settings, products, opts]
  );

  return (
    <div
      ref={sheetRef}
      data-combined="true"
      className="combined-sheet bg-white text-black border border-neutral-400"
      style={{ width: '148mm', fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div className="p-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-2 border-b border-black">
          <div className="min-w-0">
            <div className="font-bold tracking-tight text-sm text-black">{model.seller.name}</div>
            {model.seller.addressLines.map((l, i) => (
              <div key={i} className="text-[9px] text-black leading-snug">{l}</div>
            ))}
            <div className="text-[9px] text-black mt-0.5 font-mono">
              {model.seller.gstin && <>GSTIN: {model.seller.gstin} · </>}
              {model.seller.stateName} ({model.seller.stateCode})
            </div>
            {model.seller.phone && (
              <div className="text-[9px] text-black">Ph: {model.seller.phone}</div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="inline-block border border-black px-2 py-0.5 font-bold tracking-[0.15em] uppercase text-[10px] text-black">
              {model.title}
            </div>
          </div>
        </div>

        {/* Meta strip */}
        <div className="grid grid-cols-2 gap-x-3 py-1.5 border-b border-neutral-300 text-[9px]">
          <div className="flex justify-between">
            <span className="text-neutral-700">Invoice No.</span>
            <span className="font-mono font-semibold text-black">{model.invoiceNo}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-700">Dated</span>
            <span className="font-mono font-semibold text-black">{model.dated}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-700">Place of Supply</span>
            <span className="font-semibold text-black">{model.buyer.stateName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-700">Reverse Charge</span>
            <span className="font-semibold text-black">No</span>
          </div>
        </div>
        {/* Bill To / Ship To */}
<div className={`grid ${model.consignee ? 'grid-cols-2' : 'grid-cols-1'} gap-3 py-2 border-b border-neutral-300`}>
  <div>
    <div className="text-[8px] uppercase tracking-wider text-neutral-600 font-semibold mb-0.5">
      Bill To
    </div>
    <div className="text-[11px] font-bold text-black">{model.buyer.name}</div>
    {model.buyer.addressLines.map((l, i) => (
      <div key={i} className="text-[9px] text-black leading-snug">{l}</div>
    ))}
    {opts.show.buyerGstin && model.buyer.gstin && (
      <div className="text-[9px] font-mono font-semibold text-black mt-0.5">
        GSTIN: {model.buyer.gstin}
      </div>
    )}
    {model.buyer.phone && (
      <div className="text-[9px] font-mono text-black">Ph: {model.buyer.phone}</div>
    )}
  </div>
  {model.consignee && (
    <div>
      <div className="text-[8px] uppercase tracking-wider text-neutral-600 font-semibold mb-0.5">
        Ship To
      </div>
      <div className="text-[11px] font-bold text-black">{model.consignee.name}</div>
      {model.consignee.addressLines.map((l, i) => (
        <div key={i} className="text-[9px] text-black leading-snug">{l}</div>
      ))}
      <div className="text-[9px] text-black">
        {model.consignee.stateName} ({model.consignee.stateCode})
      </div>
    </div>
  )}
</div>

{/* Items table */}
<div className="pt-1.5">
  <table className="w-full text-[9px]">
    <thead>
      <tr className="border-b border-black text-[8px] uppercase tracking-wider text-neutral-700">
        <th className="text-left py-1 font-semibold w-4">#</th>
        <th className="text-left py-1 font-semibold">Description</th>
        {cfg.showHsnColumn && (
          <th className="text-left py-1 font-semibold w-10">HSN</th>
        )}
        <th className="text-right py-1 font-semibold w-6">Qty</th>
        <th className="text-right py-1 font-semibold w-12">Rate</th>
        <th className="text-right py-1 font-semibold w-14">Amount</th>
      </tr>
    </thead>
    <tbody>
      {model.rows.map(r => (
        <tr key={r.sl} className="border-b border-neutral-200 align-top">
          <td className="py-1 text-neutral-600">{r.sl}</td>
          <td className="py-1 pr-1">
            <div className="font-medium text-black leading-tight">{r.name}</div>
            {opts.show.itemDetails && r.detail && (
              <div className="text-[8px] text-neutral-600">{r.detail}</div>
            )}
          </td>
          {cfg.showHsnColumn && (
            <td className="py-1 font-mono text-neutral-700">{r.hsn}</td>
          )}
          <td className="py-1 text-right tabular-nums text-black">{r.qty}</td>
          <td className="py-1 text-right tabular-nums text-black">{fmtMoney(r.rate)}</td>
          <td className="py-1 text-right tabular-nums font-semibold text-black">
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
        <div className="flex justify-between border-t border-black mt-1 pt-1 text-[11px] font-bold text-black">
          <span>Grand Total</span>
          <span className="tabular-nums">₹ {fmtMoney(model.grandTotal)}</span>
        </div>
      </>
    ) : (
      <>
        <LineRow label="Sub Total" value={fmtMoney(model.rawTotal)} />
        <div className="flex justify-between border-t border-black mt-1 pt-1 text-[11px] font-bold text-black">
          <span>Grand Total</span>
          <span className="tabular-nums">₹ {fmtMoney(model.grandTotal)}</span>
        </div>
      </>
    )}
  </div>
</div>

{/* Amount in words */}
<div className="mt-1.5 pt-1.5 border-t border-neutral-300 text-[9px]">
  <span className="text-[8px] uppercase tracking-wider text-neutral-600 font-semibold mr-1">
    In words:
  </span>
  <span className="font-medium text-black">{model.amountWords} Only</span>
</div>
          {/* Optional: Remarks */}
  {cfg.showRemarks && model.remarks && (
    <div className="mt-1.5 pt-1.5 border-t border-neutral-300 text-[9px]">
      <span className="text-[8px] uppercase tracking-wider text-neutral-600 font-semibold mr-1">
        Remarks:
      </span>
      <span className="text-black">{model.remarks}</span>
    </div>
  )}

  {/* Optional: Bank + UPI + Declaration */}
  {(cfg.showBank || cfg.showUpi || cfg.showDeclaration) && (
    <div className="mt-1.5 pt-1.5 border-t border-neutral-300 grid grid-cols-2 gap-3 text-[8px]">
      {(cfg.showBank || cfg.showUpi) && (
        <div>
          <div className="text-[8px] uppercase tracking-wider text-neutral-600 font-semibold mb-0.5">
            Bank
          </div>
          {cfg.showBank && (settings as any).bankName && (
            <div className="text-black">
              <span className="text-neutral-600">Bank: </span>
              {(settings as any).bankName}
            </div>
          )}
          {cfg.showBank && (settings as any).accountNumber && (
            <div className="font-mono text-black">
              <span className="text-neutral-600 font-sans">A/c: </span>
              {(settings as any).accountNumber}
            </div>
          )}
          {cfg.showBank && (settings as any).ifscCode && (
            <div className="font-mono text-black">
              <span className="text-neutral-600 font-sans">IFSC: </span>
              {(settings as any).ifscCode}
            </div>
          )}
          {cfg.showUpi && (settings as any).upiId && (
            <div className="text-black">
              <span className="text-neutral-600">UPI: </span>
              <span className="font-mono">{(settings as any).upiId}</span>
            </div>
          )}
        </div>
      )}
      {cfg.showDeclaration && (
        <div>
          <div className="text-[8px] uppercase tracking-wider text-neutral-600 font-semibold mb-0.5">
            Declaration
          </div>
          <p className="text-black leading-snug text-[8px]">{DEFAULT_DECLARATION}</p>
          <p className="text-neutral-700 mt-0.5 text-[8px]">
            Subject to <span className="font-medium">{opts.jurisdiction}</span> jurisdiction.
          </p>
        </div>
      )}
    </div>
  )}

  {/* Optional: Signature */}
  {cfg.showSignature && (
    <div className="mt-3 pt-3 grid grid-cols-2 gap-3">
      <div>
        <div className="border-t border-neutral-500 pt-1 text-[8px] text-neutral-700">
          Customer Signature
        </div>
      </div>
      <div className="text-right">
        <div className="text-[8px] text-neutral-600 mb-4">For</div>
        <div className="text-[9px] font-semibold text-black">{model.seller.name}</div>
        <div className="border-t border-neutral-500 pt-1 text-[8px] text-neutral-700 mt-4">
          Authorised Signatory
        </div>
      </div>
    </div>
  )}
</div>
            {/* Cut line (optional) */}
      {cfg.showCutLine && (
        <div className="flex items-center justify-center px-3 py-1 bg-white">
          <div className="flex-1 border-t border-dashed border-black" />
          <div className="mx-2 flex items-center gap-1 text-black">
            <Scissors className="w-3 h-3" />
            <span className="text-[8px] uppercase tracking-wider font-semibold">
              Cut here
            </span>
          </div>
          <div className="flex-1 border-t border-dashed border-black" />
        </div>
      )}

      {/* Label half */}
      <div className="border-t-2 border-black">
        <CourierLabelBlock
          order={order}
          courierName={courierName}
          awbNumber={awbNumber}
          hideBarcode={hideBarcode}
          showPaymentBanner={cfg.labelShowPaymentBanner}
          showReturnTo={cfg.labelShowReturnTo}
          showContents={cfg.labelShowContents}
          showBatteryWarning={cfg.labelShowBattery}
        />
      </div>
    </div>
  );
};

/* Compact line-row helper */
const LineRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between py-0.5">
    <span className="text-neutral-700">{label}</span>
    <span className="tabular-nums text-black">{value}</span>
  </div>
);
