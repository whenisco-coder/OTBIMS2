declare module 'html2pdf.js';

import html2pdf from 'html2pdf.js';
import type { InvoicePaper } from './invoiceModel';

/* ------------------------------------------------------------------ */
/*  Paper size mapping                                                 */
/* ------------------------------------------------------------------ */

export function paperToJsPDFFormat(paper: InvoicePaper): string | [number, number] {
  switch (paper) {
    case 'A4':          return 'a4';
    case 'A5':          return 'a5';
    case 'A6':          return 'a6';
    case 'THERMAL_4x6': return [4, 6];
    case 'THERMAL_2':   return [2, 8];
    case 'THERMAL_3':   return [3, 8];
  }
}

export function paperToPageCSS(paper: InvoicePaper): string {
  switch (paper) {
    case 'A4':          return 'A4';
    case 'A5':          return 'A5';
    case 'A6':          return 'A6';
    case 'THERMAL_4x6': return '4in 6in';
    case 'THERMAL_2':   return '2in 8in';
    case 'THERMAL_3':   return '3in 8in';
  }
}

/* ------------------------------------------------------------------ */
/*  Mobile detection                                                   */
/* ------------------------------------------------------------------ */

export function isMobileLike(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const iPadOS =
    navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || iPadOS;
}

/* ------------------------------------------------------------------ */
/*  Save / share the generated PDF                                     */
/* ------------------------------------------------------------------ */

export async function saveAndShareFile(
  filename: string,
  dataUri: string,
  mimeType: string
): Promise<'shared' | 'downloaded'> {
  const res = await fetch(dataUri);
  const blob = await res.blob();

  try {
    const file = new File([blob], filename, { type: mimeType });
    if (
      typeof navigator !== 'undefined' &&
      'canShare' in navigator &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') return 'shared';
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return 'downloaded';
}
/* ------------------------------------------------------------------ */
/*  PDF cache (IndexedDB) — reprints are instant                       */
/* ------------------------------------------------------------------ */

const DB_NAME = 'otbims-invoice-cache';
const STORE = 'pdfs';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function cacheGet(key: string): Promise<string | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function cacheSet(key: string, value: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* cache write failure is not fatal */
  }
}

/** Build a short cache key from the things that affect output. */
export function buildCacheKey(parts: {
  orderId: string;
  invoiceNo?: string;
  paper: InvoicePaper;
  optionsHash: string;
  combined?: boolean;
}): string {
  const { orderId, invoiceNo, paper, optionsHash, combined } = parts;
  return [orderId, invoiceNo || '', paper, combined ? 'C' : 'S', optionsHash].join('|');
}

export function clearPdfCache(): Promise<void> {
  return openDb().then(
    db =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

/* ------------------------------------------------------------------ */
/*  Main print entry point                                             */
/* ------------------------------------------------------------------ */

export interface PrintOptions {
  element: HTMLElement;
  paper: InvoicePaper;
  filename: string;
  onProgress?: (msg: string) => void;
  forcePdf?: boolean;
  cacheKey?: string;
  skipCache?: boolean;
}

export type PrintResult = 'printed' | 'shared' | 'downloaded' | 'failed' | 'cancelled';

export async function printInvoice(opts: PrintOptions): Promise<PrintResult> {
  const { element, paper, filename, onProgress, forcePdf, cacheKey, skipCache } = opts;

  /* ---------- Mobile (or forced PDF): build a PDF and share ---------- */
  if (forcePdf || isMobileLike()) {
    try {
      let dataUri: string | null = null;

      if (!skipCache && cacheKey) {
        onProgress?.('Checking cache…');
        dataUri = await cacheGet(cacheKey);
      }

      if (!dataUri) {
        onProgress?.('Generating PDF…');
        dataUri = await html2pdf()
          .from(element)
          .set({
            margin: 0.3,
            filename,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 1.5, useCORS: true, logging: false },
            jsPDF: {
              unit: 'in',
              format: paperToJsPDFFormat(paper),
              orientation: 'portrait' as const,
            },
          })
          .outputPdf('datauristring');

        if (cacheKey) await cacheSet(cacheKey, dataUri);
      }

      onProgress?.('Opening share sheet…');
      const how = await saveAndShareFile(filename, dataUri, 'application/pdf');
      onProgress?.('');
      return how;
    } catch (err) {
      console.error('PDF generation failed', err);
      onProgress?.('');
      /* fall through to window.print() as last resort */
    }
  }

  /* ---------- Desktop: window.print() with dynamic @page size ---------- */
  try {
    const styleId = 'invoice-dynamic-page-size';
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = `@media print { @page { size: ${paperToPageCSS(paper)}; margin: 6mm; } }`;

    window.print();
    return 'printed';
  } catch (err) {
    console.error('Print failed', err);
    return 'failed';
  }
}
/* ------------------------------------------------------------------ */
/*  Backward-compat: simple page print for non-invoice views          */
/*  (Products, Reports, Ledger, Shipping Label, etc.)                 */
/* ------------------------------------------------------------------ */

/**
 * Plain "print this page" helper. Used by views that just want the browser
 * print dialog (no PDF, no share sheet). The invoice system uses
 * `printInvoice` above instead.
 */
export function safePrint(): void {
  try {
    window.print();
  } catch (err) {
    console.error('Print failed', err);
  }
}
