import React, { useEffect, useMemo, useRef, useState } from 'react';
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
} from '../../utils/invoiceModel';
import { printInvoice } from '../../utils/print';
import { predictOverflow } from '../../utils/measure';
import { PrePrintDialog, type PrePrintResult } from './PrePrintDialog';
import {
  CombinedSheet,
  DEFAULT_COMBINED_CONFIG,
  type CombinedConfig,
} from './CombinedSheet';
import { TallyClassicTemplate } from './templates/TallyClassicTemplate';
import { ModernMinimalTemplate } from './templates/ModernMinimalTemplate';
import { CompactRetailTemplate } from './templates/CompactRetailTemplate';
import {
  ArrowLeft,
  Printer,
  FileDown,
  Sliders,
  ChevronDown,
  ChevronUp,
  Truck,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Templates                                                          */
/* ------------------------------------------------------------------ */

export type TemplateId = 'tally' | 'modern' | 'compact';

const TEMPLATES: { id: TemplateId; label: string; hint: string }[] = [
  { id: 'tally',   label: 'Tally',   hint: 'CA-friendly · B2B' },
  { id: 'modern',  label: 'Modern',  hint: 'Clean · B2C' },
  { id: 'compact', label: 'Compact', hint: 'Dense · Retail' },
];

const TEMPLATE_STORAGE_KEY = 'otbims.invoice.template.v1';

function pickDefaultTemplate(order: Order): TemplateId {
  return order.customerType === 'B2B' ? 'tally' : 'modern';
}

/* ------------------------------------------------------------------ */
/*  Paper size map                                                     */
/* ------------------------------------------------------------------ */

const PAPER_INFO: Record<
  InvoicePaper,
  { w: string; minH: string; pad: string; label: string; hint: string }
> = {
  A5:          { w: '148mm',   minH: '210mm',   pad: 'p-5', label: 'A5',  hint: 'Half A4 · Default' },
  A4:          { w: '210mm',   minH: '297mm',   pad: 'p-8', label: 'A4',  hint: 'Standard office' },
  A6:          { w: '105mm',   minH: '148mm',   pad: 'p-4', label: 'A6',  hint: 'Quarter A4' },
  THERMAL_4x6: { w: '101.6mm', minH: '152.4mm', pad: 'p-3', label: '4×6', hint: 'Thermal label' },
  THERMAL_2:   { w: '50.8mm',  minH: '203.2mm', pad: 'p-2', label: '2"',  hint: 'Narrow receipt' },
  THERMAL_3:   { w: '76.2mm',  minH: '203.2mm', pad: 'p-3', label: '3"',  hint: 'Receipt roll' },
};

const ALL_PAPERS: InvoicePaper[] = ['A5', 'A4', 'A6', 'THERMAL_4x6', 'THERMAL_2', 'THERMAL_3'];

const COMBINED_STORAGE_KEY = 'otbims.combined.config.v1';

const MM_PER_PX = 1 / 3.7795275591;

/* ------------------------------------------------------------------ */
/*  Primitives                                                         */
/* ------------------------------------------------------------------ */

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

interface InvoiceViewProps {
  order: Order;
  onBack?: () => void;
  onViewLabel?: (order: Order) => void;
}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                {m === 'TAX' ? 'Tax Invoice' : 'Retail / Cash Memo'}
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

      {/* Paper size */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-1.5">
          Paper Size
        </div>
        <div className="flex flex-wrap gap-1">
          {ALL_PAPERS.map(p => {
            const info = PAPER_INFO[p];
            const active = opts.paper === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => patch({ paper: p })}
                className={`px-2.5 py-1 text-[11px] font-medium border text-left ${
                  active
                    ? 'bg-neutral-900 text-white border-neutral-900'
                    : 'border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                }`}
                title={info.hint}
              >
                <div className="font-semibold">{info.label}</div>
                <div className={`text-[9px] ${active ? 'text-neutral-300' : 'text-neutral-400'}`}>
                  {info.hint}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-neutral-200" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-2">
            Sections to show
          </div>
          <div className="grid grid-cols-2 gap-x-4">
            <Toggle checked={opts.show.dispatch} onChange={v => patchShow({ dispatch: v })} label="Dispatch & transport" />
            <Toggle checked={opts.show.hsnSummary} onChange={v => patchShow({ hsnSummary: v })} label="HSN summary" hint="Shown on B2C too" />
            <Toggle checked={opts.show.taxWords} onChange={v => patchShow({ taxWords: v })} label="Tax in words" />
            <Toggle checked={opts.show.bank} onChange={v => patchShow({ bank: v })} label="Bank details" />
            <Toggle checked={opts.show.upi} onChange={v => patchShow({ upi: v })} label="UPI (ID / QR)" />
            <Toggle checked={opts.show.declaration} onChange={v => patchShow({ declaration: v })} label="Declaration" />
            <Toggle checked={opts.show.buyerGstin} onChange={v => patchShow({ buyerGstin: v })} label="Buyer GSTIN" />
            <Toggle checked={opts.show.itemDetails} onChange={v => patchShow({ itemDetails: v })} label="Item detail line" hint="SKU · Brand · Warranty" />
            <Toggle checked={opts.show.roundOff} onChange={v => patchShow({ roundOff: v })} label="Round off line" />
            <Toggle checked={opts.show.remarks} onChange={v => patchShow({ remarks: v })} label="Remarks / notes" />
            <Toggle checked={opts.show.shipTo} onChange={v => patchShow({ shipTo: v })} label="Ship To block" hint="Only if billing ≠ shipping" />
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
export const InvoiceView: React.FC<InvoiceViewProps> = ({ order, onBack, onViewLabel }) => {
  const { settings, products, showToast } = useStore();

  const STORAGE_KEY = 'otbims.invoice.options.v2';

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

  const [template, setTemplate] = useState<TemplateId>(() => {
    try {
      const saved = localStorage.getItem(TEMPLATE_STORAGE_KEY) as TemplateId | null;
      if (saved === 'tally' || saved === 'modern' || saved === 'compact') return saved;
    } catch {}
    return pickDefaultTemplate(order);
  });

  useEffect(() => {
    try {
      localStorage.setItem(TEMPLATE_STORAGE_KEY, template);
    } catch {}
  }, [template]);

  const model: InvoiceModel = useMemo(
    () => buildInvoiceModel(order, settings as any, products, opts),
    [order, settings, products, opts]
  );

  const [panelOpen, setPanelOpen] = useState(false);
  const [printProgress, setPrintProgress] = useState('');
  const invoiceRef = useRef<HTMLDivElement>(null);
  const combinedRef = useRef<HTMLDivElement>(null);

  const [viewMode, setViewMode] = useState<'invoice' | 'combined'>('invoice');
  const [combinedCfg, setCombinedCfg] = useState<CombinedConfig>(() => {
    try {
      const raw = localStorage.getItem(COMBINED_STORAGE_KEY);
      if (raw) return { ...DEFAULT_COMBINED_CONFIG, ...JSON.parse(raw) };
    } catch {}
    return DEFAULT_COMBINED_CONFIG;
  });

  useEffect(() => {
    try {
      localStorage.setItem(COMBINED_STORAGE_KEY, JSON.stringify(combinedCfg));
    } catch {}
  }, [combinedCfg]);

  const [prePrint, setPrePrint] = useState<{
    open: boolean;
    savePdf: boolean;
    prediction: ReturnType<typeof predictOverflow> | null;
  }>({ open: false, savePdf: false, prediction: null });

  const paper = PAPER_INFO[opts.paper];

  const effectiveCourier =
    order.courierName || settings.savedCouriers[0] || 'Delhivery';
  const effectiveAwb =
    order.awbNumber || `AWB${order.orderNo.replace(/\D/g, '')}`;

  const getActiveRef = (): HTMLDivElement | null =>
    viewMode === 'combined' ? combinedRef.current : invoiceRef.current;

  const buildFilename = () =>
    viewMode === 'combined'
      ? `Invoice-Label-${order.invoiceNo || order.orderNo}.pdf`
      : `Invoice-${order.invoiceNo || order.orderNo}.pdf`;

  const runPrint = async (forcePdf: boolean) => {
  const el = getActiveRef();
  if (!el) return;
  setPrintProgress('Preparing…');
  try {
    const result = await printInvoice({
      element: el,
      paper: viewMode === 'combined' ? 'A5' : opts.paper,
      filename: buildFilename(),
      onProgress: setPrintProgress,
      forcePdf,
    });
    setPrintProgress('');
    if (result === 'shared') showToast('PDF sent to share sheet', 'success');
    else if (result === 'downloaded') showToast('PDF downloaded', 'success');
    else if (result === 'failed') showToast('Print failed.', 'error');
  } catch (err: any) {
    setPrintProgress('');
    showToast(err?.message || 'PDF generation failed', 'error');
  }
};
  const handlePrint = () => {
    const el = getActiveRef();
    if (!el) return;
    const paperForMeasure = viewMode === 'combined' ? 'A5' : opts.paper;
    const prediction = predictOverflow(el, paperForMeasure);
    const needsWarning = !prediction.invoiceFits || !prediction.combinedFits;
    if (needsWarning) {
      setPrePrint({ open: true, savePdf: false, prediction });
    } else {
      runPrint(false);
    }
  };

  const handleSavePdf = () => {
    const el = getActiveRef();
    if (!el) return;
    const paperForMeasure = viewMode === 'combined' ? 'A5' : opts.paper;
    const prediction = predictOverflow(el, paperForMeasure);
    const needsWarning = !prediction.invoiceFits;
    if (needsWarning) {
      setPrePrint({ open: true, savePdf: true, prediction });
    } else {
      runPrint(true);
    }
  };

  const handlePrintWithLabel = () => {
    setViewMode('combined');
    setTimeout(() => handlePrint(), 50);
  };

  const onPrePrintClose = (r: PrePrintResult) => {
    const wasSavePdf = prePrint.savePdf;
    if (r.action === 'proceed') {
      setPrePrint({ open: false, savePdf: false, prediction: null });
      runPrint(wasSavePdf);
    } else if (r.action === 'changePaper' && r.paper) {
      setOpts({ ...opts, paper: r.paper });
      setPrePrint({ open: false, savePdf: false, prediction: null });
    } else {
      setPrePrint({ open: false, savePdf: false, prediction: null });
    }
  };

  const switchTemplate = (t: TemplateId) => {
    setTemplate(t);
    const label = TEMPLATES.find(x => x.id === t)?.label ?? t;
    showToast(`Template: ${label} · saved as default`, 'info');
  };
  return (
  <div className="space-y-4">
    {/* Toolbar */}
    <div className="no-print p-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-2">
      {/* Row 1: back, badge, meta, actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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
              {order.customerName} · {order.customerPhone} ·{' '}
              {viewMode === 'combined' ? 'A5 Combined' : paper.label}
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
            {panelOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <div className="flex items-center border border-neutral-300 dark:border-neutral-700 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('invoice')}
              className={`px-2.5 py-1.5 font-semibold ${
                viewMode === 'invoice'
                  ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-950'
                  : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              Invoice
            </button>
            <button
              type="button"
              onClick={() => setViewMode('combined')}
              className={`px-2.5 py-1.5 font-semibold border-l border-neutral-300 dark:border-neutral-700 ${
                viewMode === 'combined'
                  ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-950'
                  : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              + Label
            </button>
          </div>

          {viewMode === 'invoice' && (
            <button
              type="button"
              onClick={handlePrintWithLabel}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-amber-500 text-amber-700 dark:text-amber-400 text-xs font-semibold hover:bg-amber-50 dark:hover:bg-amber-950/30"
            >
              <Truck className="w-3.5 h-3.5" />
              Print with Label
            </button>
          )}

          {onViewLabel && (
            <button
              type="button"
              onClick={() => onViewLabel(order)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-neutral-300 dark:border-neutral-700 text-xs font-semibold hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              <Truck className="w-3.5 h-3.5 text-amber-500" />
              <span>2. Label →</span>
            </button>
          )}

          <button
            type="button"
            onClick={handlePrint}
            disabled={!!printProgress}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-neutral-900 dark:border-white text-neutral-900 dark:text-white text-xs font-bold hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-60"
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>

          <button
            type="button"
            onClick={handleSavePdf}
            disabled={!!printProgress}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-950 text-xs font-bold hover:opacity-90 disabled:opacity-60"
          >
            <FileDown className="w-3.5 h-3.5" />
            {printProgress || 'Save PDF'}
          </button>
        </div>
      </div>

      {/* Row 2: Template switcher */}
      {viewMode === 'invoice' && (
        <div className="flex items-center gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-800">
          <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
            Template
          </span>
          <div className="flex items-center border border-neutral-300 dark:border-neutral-700 text-xs">
            {TEMPLATES.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => switchTemplate(t.id)}
                title={t.hint}
                className={`px-3 py-1 font-semibold ${
                  i > 0 ? 'border-l border-neutral-300 dark:border-neutral-700' : ''
                } ${
                  template === t.id
                    ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-950'
                    : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-neutral-500 italic">
            {TEMPLATES.find(t => t.id === template)?.hint}
          </span>
        </div>
      )}
    </div>

    {/* Customize panel */}
    {panelOpen && (
      <div className="no-print p-4 bg-neutral-50 dark:bg-neutral-900/50 border border-neutral-200 dark:border-neutral-800 space-y-6">
        <OptionsPanel opts={opts} setOpts={setOpts} order={order} />

        {viewMode === 'combined' && (
          <div className="pt-4 border-t border-neutral-200">
            <div className="text-xs font-bold uppercase tracking-wider mb-3">
              Combined sheet options
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
              <Toggle checked={combinedCfg.showCutLine} onChange={v => setCombinedCfg({ ...combinedCfg, showCutLine: v })} label="Cut line" hint="Dashed line between halves" />
              <Toggle checked={combinedCfg.showSignature} onChange={v => setCombinedCfg({ ...combinedCfg, showSignature: v })} label="Signature block" hint="Rule 46(p)" />
              <Toggle checked={combinedCfg.showHsnColumn} onChange={v => setCombinedCfg({ ...combinedCfg, showHsnColumn: v })} label="HSN column" />
              <Toggle checked={combinedCfg.showBank} onChange={v => setCombinedCfg({ ...combinedCfg, showBank: v })} label="Bank details" />
              <Toggle checked={combinedCfg.showUpi} onChange={v => setCombinedCfg({ ...combinedCfg, showUpi: v })} label="UPI ID" />
              <Toggle checked={combinedCfg.showDeclaration} onChange={v => setCombinedCfg({ ...combinedCfg, showDeclaration: v })} label="Declaration" />
              <Toggle checked={combinedCfg.showRemarks} onChange={v => setCombinedCfg({ ...combinedCfg, showRemarks: v })} label="Remarks" />
              <Toggle checked={combinedCfg.labelShowPaymentBanner} onChange={v => setCombinedCfg({ ...combinedCfg, labelShowPaymentBanner: v })} label="Label: Payment banner" />
              <Toggle checked={combinedCfg.labelShowReturnTo} onChange={v => setCombinedCfg({ ...combinedCfg, labelShowReturnTo: v })} label="Label: Return address" hint="Recommended" />
              <Toggle checked={combinedCfg.labelShowContents} onChange={v => setCombinedCfg({ ...combinedCfg, labelShowContents: v })} label="Label: Contents list" />
              <Toggle checked={combinedCfg.labelShowBattery} onChange={v => setCombinedCfg({ ...combinedCfg, labelShowBattery: v })} label="Label: Battery warning" />
            </div>
          </div>
        )}
      </div>
    )}
          {/* Sheet */}
      <div className="flex justify-center p-4 print:p-0">
        {viewMode === 'combined' ? (
          <CombinedSheet
            sheetRef={combinedRef}
            order={order}
            opts={opts}
            courierName={effectiveCourier}
            awbNumber={effectiveAwb}
            config={combinedCfg}
            hideBarcode={false}
          />
        ) : (
          <div
            ref={invoiceRef}
            data-paper={opts.paper}
            data-template={template}
            className={`invoice-sheet bg-white text-neutral-900 shadow-sm print:shadow-none ${paper.pad}`}
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              width: paper.w,
              minHeight: paper.minH,
            }}
          >
            {template === 'tally' && (
              <TallyClassicTemplate
                order={order}
                model={model}
                opts={opts}
                settings={settings}
              />
            )}
            {template === 'modern' && (
              <ModernMinimalTemplate
                order={order}
                model={model}
                opts={opts}
                settings={settings}
              />
            )}
            {template === 'compact' && (
              <CompactRetailTemplate
                order={order}
                model={model}
                opts={opts}
                settings={settings}
              />
            )}
          </div>
        )}
      </div>

      {/* Pre-print dialog */}
      {prePrint.open && prePrint.prediction && (
        <PrePrintDialog
          open={true}
          onClose={onPrePrintClose}
          paper={opts.paper}
          invoiceHeightMm={Math.round(prePrint.prediction.invoiceHeightPx * MM_PER_PX * 10) / 10}
          availableMm={Math.round(prePrint.prediction.availablePx * MM_PER_PX * 10) / 10}
          overflowMm={prePrint.prediction.overflowMm}
          invoiceFits={prePrint.prediction.invoiceFits}
          combinedFits={prePrint.prediction.combinedFits}
          willMoveLabel={prePrint.prediction.invoiceFits && !prePrint.prediction.combinedFits}
          onSavePdf={prePrint.savePdf}
        />
      )}
    </div>
  );
};
