import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import type { Order } from '../../types';
import { formatINR } from '../../utils/gst';
import { generateCode128Svg } from '../../utils/barcode';
import { getCourierEncoding, composeBarcodeContent } from '../../utils/couriers';

export interface CourierLabelBlockProps {
  order: Order;
  courierName: string;
  awbNumber: string;
  hideBarcode?: boolean;
  compact?: boolean;
  hideReturnTo?: boolean;
}

export const CourierLabelBlock: React.FC<CourierLabelBlockProps> = ({
  order,
  courierName,
  awbNumber,
  hideBarcode,
  compact,
  hideReturnTo,
}) => {
  const { settings } = useStore();

  const hasBatteryItem = order.items.some(it => it.hasBattery);
  const batteryTypes = order.items
    .filter(it => it.hasBattery)
    .map(it => it.batteryType || 'Battery')
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ');

  const encoding = getCourierEncoding(courierName);
  const barcodeContent = composeBarcodeContent(awbNumber, encoding);
  const barcodeSvg = hideBarcode ? '' : generateCode128Svg(barcodeContent, 240, 55, true);

  return (
    <div className="bg-white text-black p-3 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-black pb-1.5 mb-2">
        <div>
          <span className="text-[9px] font-mono uppercase text-neutral-500 block">CARRIER</span>
          <h2 className="text-sm font-bold tracking-tight uppercase font-mono">{courierName}</h2>
        </div>
        <div className="text-right font-mono">
          <span className="text-[9px] uppercase text-neutral-500 block">ROUTING</span>
          <span className="text-base font-black">{order.shippingAddress.pincode}</span>
        </div>
      </div>

      {/* Payment banner — hidden in compact mode */}
      {!compact && (
        <div className="flex items-center justify-between border-2 border-black p-1.5 mb-2">
          <div className="font-mono">
            <span className="text-[8px] uppercase font-bold text-neutral-500 block">PAYMENT MODE</span>
            <span className="text-xs font-extrabold uppercase">
              {order.paymentStatus === 'COD' ? 'CASH ON DELIVERY (COD)' : 'PREPAID'}
            </span>
          </div>
          <div className="text-right font-mono">
            <span className="text-[8px] uppercase font-bold text-neutral-500 block">COLLECT</span>
            <span className="text-sm font-black tabular-nums">
              {order.paymentStatus === 'COD' ? formatINR(order.grandTotal) : '₹0.00'}
            </span>
          </div>
        </div>
      )}

      {/* Barcode */}
      {!hideBarcode && (
        <div className="flex flex-col items-center justify-center py-2 border-b-2 border-black mb-2">
          <div className="w-full flex justify-center" dangerouslySetInnerHTML={{ __html: barcodeSvg }} />
          <div className="text-xs font-mono font-black tracking-widest mt-1">
            AWB: {awbNumber}
          </div>
        </div>
      )}

      {/* SHIP TO — big, bold */}
      <div className="border-b-2 border-black pb-2 mb-2">
        <div className="text-[9px] uppercase font-black text-neutral-600 font-mono mb-0.5 tracking-wider">
          SHIP TO (CONSIGNEE):
        </div>
        <h3 className="text-lg font-black uppercase text-black leading-tight tracking-tight">
          {order.customerName}
        </h3>
        <p className="text-sm font-bold text-neutral-900 leading-snug mt-0.5">
          {order.shippingAddress.addressLine}
        </p>
        <p className="text-base font-black text-black leading-tight">
          {order.shippingAddress.city}, {order.shippingAddress.state}
        </p>
        <p className="text-lg font-black text-black leading-tight tracking-wider">
          PIN — {order.shippingAddress.pincode}
        </p>
        <div className="mt-1 text-lg font-black font-mono text-black">
          TEL: {order.customerPhone}
        </div>
      </div>

      {/* Battery warning */}
      {hasBatteryItem && (
        <div className="border-2 border-black p-1.5 mb-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-black shrink-0 mt-0.5" />
          <div className="font-mono text-[10px]">
            <div className="font-bold uppercase tracking-wider text-black">
              ⚠ BATTERY HAZARD: {batteryTypes}
            </div>
            <p className="text-[9px] text-neutral-800 uppercase font-medium leading-tight">
              Package contains chemical power cells. Handle with care.
            </p>
          </div>
        </div>
      )}

      {/* Contents */}
      <div className="border-b border-black pb-1.5 mb-2 font-mono text-[10px]">
        <div className="text-[9px] uppercase font-bold text-neutral-500 mb-0.5">
          CONTENTS / ORDER {order.orderNo}:
        </div>
        <div className="space-y-0.5">
          {order.items.map((it, idx) => (
            <div key={idx} className="flex justify-between">
              <span className="truncate max-w-[180px]">{it.qty}× {it.name}</span>
              <span className="tabular-nums">SKU: {it.sku}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Return to — seller's address */}
      {!hideReturnTo && (
        <div className="text-[9px] font-mono text-neutral-700">
          <div className="text-[8px] uppercase font-bold text-neutral-500">RETURN TO (IF UNDELIVERED):</div>
          <div className="font-bold text-black uppercase text-[10px]">{settings.businessName}</div>
          <div className="text-[9px] leading-tight">{settings.address}</div>
          <div className="text-[9px]">Ph: {settings.phone} · GSTIN: {settings.gstin}</div>
        </div>
      )}
    </div>
  );
};
