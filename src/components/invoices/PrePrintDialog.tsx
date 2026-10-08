import React from 'react';
import { AlertTriangle, Printer, FileDown, X } from 'lucide-react';
import type { InvoicePaper } from '../../utils/invoiceModel';

export interface PrePrintResult {
  action: 'proceed' | 'changePaper' | 'cancel';
  paper?: InvoicePaper;
}

interface Props {
  open: boolean;
  onClose: (r: PrePrintResult) => void;
  paper: InvoicePaper;
  invoiceHeightMm: number;
  availableMm: number;
  overflowMm: number;
  invoiceFits: boolean;
  combinedFits: boolean;
  willMoveLabel: boolean;
  onSavePdf?: boolean;
}

const PAPER_OPTIONS: { value: InvoicePaper; label: string }[] = [
  { value: 'A5', label: 'A5 — Half A4 (default)' },
  { value: 'A4', label: 'A4 — Full page' },
  { value: 'A6', label: 'A6 — Quarter A4' },
  { value: 'THERMAL_4x6', label: 'Thermal 4×6' },
  { value: 'THERMAL_2', label: 'Thermal 2"' },
  { value: 'THERMAL_3', label: 'Thermal 3"' },
];

export const PrePrintDialog: React.FC<Props> = ({
  open,
  onClose,
  paper,
  invoiceHeightMm,
  availableMm,
  overflowMm,
  invoiceFits,
  combinedFits,
  willMoveLabel,
  onSavePdf,
}) => {
  const [selectedPaper, setSelectedPaper] = React.useState<InvoicePaper>(paper);

  if (!open) return null;

  const hasProblem = !invoiceFits || !combinedFits;

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <h2 className="font-bold text-sm flex items-center gap-2">
            {hasProblem ? (
              <>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Print preview
              </>
            ) : (
              <>
                <Printer className="w-4 h-4 text-neutral-700" />
                Ready to print
              </>
            )}
          </h2>
          <button onClick={() => onClose({ action: 'cancel' })}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status block */}
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between font-mono">
            <span className="text-neutral-500">Invoice height:</span>
            <span>{invoiceHeightMm} mm</span>
          </div>
          <div className="flex justify-between font-mono">
            <span className="text-neutral-500">Available on {paper}:</span>
            <span>{availableMm} mm</span>
          </div>
          <div className="border-t pt-1.5 mt-1.5" />

          {invoiceFits && combinedFits && (
            <div className="text-green-700 dark:text-green-400 font-semibold">
              ✓ Invoice + Label will fit on one {paper} sheet
            </div>
          )}

          {invoiceFits && !combinedFits && (
            <div className="text-amber-700 dark:text-amber-400 font-semibold">
              ⚠ Invoice fits, but label needs page 2
            </div>
          )}

          {!invoiceFits && (
            <div className="text-red-700 dark:text-red-400 font-semibold">
              ✗ Invoice is {overflowMm} mm over {paper}
            </div>
          )}
        </div>

        {/* Paper selector */}
        <div className="pt-2 border-t">
          <label className="block text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-1">
            Paper size
          </label>
          <select
            value={selectedPaper}
            onChange={e => setSelectedPaper(e.target.value as InvoicePaper)}
            className="w-full p-2 text-xs border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black font-semibold"
          >
            {PAPER_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center pt-2 border-t gap-2">
          <button
            onClick={() => onClose({ action: 'cancel' })}
            className="px-3 py-1.5 border text-xs font-semibold"
          >
            Cancel
          </button>
          <div className="flex gap-1.5">
            {selectedPaper !== paper && (
              <button
                onClick={() => onClose({ action: 'changePaper', paper: selectedPaper })}
                className="px-3 py-1.5 border border-neutral-900 dark:border-white text-xs font-semibold"
              >
                Switch to {selectedPaper}
              </button>
            )}
            <button
              onClick={() => onClose({ action: 'proceed' })}
              className="px-4 py-1.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 text-xs font-bold flex items-center gap-1.5"
            >
              {onSavePdf ? <FileDown className="w-3.5 h-3.5" /> : <Printer className="w-3.5 h-3.5" />}
              {onSavePdf ? 'Save PDF' : 'Print now'}
            </button>
          </div>
        </div>

        {willMoveLabel && (
          <p className="text-[11px] text-neutral-500 italic">
            Note: courier label will print on page 2 with its own copy of the header.
          </p>
        )}
      </div>
    </div>
  );
};
