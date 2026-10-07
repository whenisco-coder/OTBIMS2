import React, { useMemo, useRef, useState } from 'react';
import { parseCustomerText, ParsedCustomer } from '../../utils/addressParser';
import { ClipboardPaste, Wand2, Check, AlertCircle, AlertTriangle } from 'lucide-react';

interface CustomerPasteBoxProps {
  onParsed: (parsed: ParsedCustomer) => void;
  /** saved customers, used to warn when the pasted mobile already exists */
  existingCustomers?: { name: string; phone: string }[];
}

const last10 = (p: string) => (p || '').replace(/\D/g, '').slice(-10);

/**
 * Paste a whole customer message (name, address, pincode, mobile, GSTIN...) and the form fills itself.
 * It is a helper only: every field stays editable, so any wrong guess is one tap to fix.
 */
export const CustomerPasteBox: React.FC<CustomerPasteBoxProps> = ({ onParsed, existingCustomers = [] }) => {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ParsedCustomer | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const run = (value: string) => {
    if (!value.trim()) {
      setResult(null);
      return;
    }
    const parsed = parseCustomerText(value);
    setResult(parsed);
    onParsed(parsed);
  };

  const pasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) {
        setText(clip);
        run(clip);
      }
    } catch {
      // Some phones block clipboard reading. Long-press inside the box and choose Paste instead.
      areaRef.current?.focus();
    }
  };

  // Already saved customer with the same mobile (checks the first and the second number)
  const duplicate = useMemo(() => {
    if (!result) return null;
    const numbers = [result.phone, result.altPhone].filter(Boolean).map(last10);
    if (numbers.length === 0) return null;
    return existingCustomers.find(c => numbers.includes(last10(c.phone))) || null;
  }, [result, existingCustomers]);

  const chips: { key: keyof ParsedCustomer['found']; label: string; optional?: boolean }[] = [
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Mobile' },
    { key: 'address', label: 'Address' },
    { key: 'city', label: 'City' },
    { key: 'pincode', label: 'Pincode' },
    { key: 'state', label: 'State' },
    { key: 'email', label: 'Email', optional: true },
    { key: 'gstin', label: 'GSTIN', optional: true },
  ];

  return (
    <div className="border border-dashed border-amber-400 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-xs uppercase tracking-wide">Paste customer details</span>
        <button
          type="button"
          onClick={pasteFromClipboard}
          className="flex items-center gap-1 px-2.5 py-1 border border-neutral-400 dark:border-neutral-600 text-xs font-semibold bg-white dark:bg-neutral-900"
        >
          <ClipboardPaste className="w-3.5 h-3.5" />
          Paste
        </button>
      </div>

      <textarea
        ref={areaRef}
        rows={3}
        value={text}
        onChange={e => setText(e.target.value)}
        onPaste={e => {
          const pasted = e.clipboardData.getData('text');
          // run after the browser has put the pasted text into the box
          window.setTimeout(() => run(areaRef.current?.value ?? pasted), 0);
        }}
        placeholder={'Paste name, address, pincode and mobile here, e.g.\nRahul Patel, 12 Shreeji Apt, Adajan, Surat 395009, 98765 43210'}
        className="w-full p-2 border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-black text-xs"
      />

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => run(text)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 text-white dark:bg-white dark:text-neutral-950 text-xs font-bold"
        >
          <Wand2 className="w-3.5 h-3.5" />
          Auto-fill the form
        </button>
        {text && (
          <button
            type="button"
            onClick={() => {
              setText('');
              setResult(null);
            }}
            className="text-xs text-neutral-500 underline"
          >
            Clear
          </button>
        )}
      </div>

      {result && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {chips
              .filter(c => !(c.optional && !result.found[c.key]))
              .map(c => {
                const ok = result.found[c.key];
                return (
                  <span
                    key={c.key}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold ${
                      ok
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                    }`}
                  >
                    {ok ? <Check className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {c.label}
                    {ok ? '' : ' missing'}
                  </span>
                );
              })}
          </div>

          {duplicate && (
            <div className="flex items-start gap-1.5 p-2 text-[11px] font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                This mobile is already saved for "{duplicate.name}". Saving will create a duplicate customer.
              </span>
            </div>
          )}

          {result.stateMismatch && (
            <div className="flex items-start gap-1.5 p-2 text-[11px] font-semibold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                GSTIN says {result.state}, but pincode {result.pincode} belongs to {result.pinState}. The GSTIN state is
                used. Please check.
              </span>
            </div>
          )}

          {result.altPhone && (
            <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
              Second mobile {result.altPhone} is saved in Private Notes.
            </p>
          )}

          <p className="text-[11px] text-neutral-600 dark:text-neutral-400">
            Filled in below. Please check it and fix anything that is wrong or missing by typing in the boxes.
          </p>
        </div>
      )}
    </div>
  );
};
