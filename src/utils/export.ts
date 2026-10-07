/**
 * File saving that works on phones.
 *
 * Why the old version failed on mobile: it released the temporary file link in the same instant it
 * started the download (phones need a moment), and inside an embedded frame / in-app browser the
 * "download" attribute is often ignored. Now we (1) keep the link alive, (2) try a normal download, and
 * (3) on phones / frames also show a small "File ready" bar with Open / Save / Share buttons that always work.
 */

export const FILE_READY_EVENT = 'tb-file-ready';
export const NOTICE_EVENT = 'tb-notice';

export interface FileReadyDetail {
  filename: string;
  url: string;
  mime: string;
  size: number;
}

export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua)) return true;
  // iPadOS pretends to be a Mac
  return /Macintosh/i.test(ua) && (navigator as any).maxTouchPoints > 1;
}

export function inEmbeddedFrame(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true; // cross-origin parent throws, which means we ARE in a frame
  }
}

export function notifyUser(message: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NOTICE_EVENT, { detail: { message } }));
}

function toBlob(content: string | Uint8Array | Blob, contentType: string): Blob {
  if (content instanceof Blob) return content;
  return new Blob([content as BlobPart], { type: contentType });
}

function clickLink(url: string, filename: string | null, newTab: boolean) {
  const link = document.createElement('a');
  link.href = url;
  if (filename) link.download = filename;
  if (newTab) {
    link.target = '_blank';
    link.rel = 'noopener';
  }
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (link.parentNode) link.parentNode.removeChild(link);
  }, 1000);
}

function announceFile(filename: string, url: string, blob: Blob) {
  const needsBackup = isMobileDevice() || inEmbeddedFrame();
  if (needsBackup) {
    window.dispatchEvent(
      new CustomEvent<FileReadyDetail>(FILE_READY_EVENT, {
        detail: { filename, url, mime: blob.type, size: blob.size },
      })
    );
  }
  // Keep the link alive long enough for slow phones; the bar also lets the user open it later.
  setTimeout(() => URL.revokeObjectURL(url), needsBackup ? 15 * 60 * 1000 : 2 * 60 * 1000);
}

/** Save a file (download). Content can be text, bytes or a Blob. */
export function downloadFile(filename: string, content: string | Uint8Array | Blob, contentType: string = 'text/plain') {
  const blob = toBlob(content, contentType);
  const url = URL.createObjectURL(blob);
  try {
    clickLink(url, filename, false);
  } catch (err) {
    console.error('Download failed, use the File ready bar instead', err);
  }
  announceFile(filename, url, blob);
}

/** Open a file in a new tab (used for PDFs so the phone's own viewer can print / share it). */
export function openFileInTab(filename: string, content: Uint8Array | Blob, contentType: string) {
  const blob = toBlob(content, contentType);
  const url = URL.createObjectURL(blob);
  try {
    clickLink(url, null, true);
  } catch (err) {
    console.error('Could not open tab, use the File ready bar instead', err);
  }
  announceFile(filename, url, blob);
}

/** Native share sheet with the file attached (WhatsApp, Gmail, Drive...). Returns what happened. */
export async function shareFile(
  filename: string,
  content: Uint8Array | Blob,
  contentType: string,
  text?: string
): Promise<'shared' | 'cancelled' | 'unsupported'> {
  const blob = toBlob(content, contentType);
  try {
    const file = new File([blob], filename, { type: contentType });
    const nav: any = navigator;
    if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
      await nav.share({ files: [file], title: filename, text: text || filename });
      return 'shared';
    }
  } catch (err: any) {
    if (err && err.name === 'AbortError') return 'cancelled';
  }
  return 'unsupported';
}

export function exportToCsv(
  filename: string,
  arg2: string[] | Record<string, any>[],
  arg3?: (string | number)[][]
) {
  let headers: string[] = [];
  let rows: (string | number)[][] = [];

  if (Array.isArray(arg2) && arg2.length > 0 && typeof arg2[0] === 'object' && !Array.isArray(arg2[0])) {
    // Array of objects passed
    const data = arg2 as Record<string, any>[];
    headers = Object.keys(data[0]);
    rows = data.map(item => headers.map(h => item[h] ?? ''));
  } else if (Array.isArray(arg2) && Array.isArray(arg3)) {
    headers = arg2 as string[];
    rows = arg3;
  } else {
    headers = Array.isArray(arg2) ? (arg2 as string[]) : [];
    rows = [];
  }

  const escapeCell = (val: string | number) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const headerLine = headers.map(escapeCell).join(',');
  const rowLines = rows.map(r => r.map(escapeCell).join(',')).join('\n');
  // BOM so Excel / Google Sheets on phones read the file as UTF-8
  const csvContent = `\uFEFF${headerLine}\r\n${rowLines.replace(/\n/g, '\r\n')}`;

  downloadFile(filename.endsWith('.csv') ? filename : `${filename}.csv`, csvContent, 'text/csv;charset=utf-8;');
}

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string) => {
    const result: string[] = [];
    let insideQuotes = false;
    let current = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

export function parseCsvToObjects(text: string): Record<string, string>[] {
  const { headers, rows } = parseCsv(text);
  const cleanHeaders = headers.map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.map(row => {
    const obj: Record<string, string> = {};
    cleanHeaders.forEach((h, idx) => {
      obj[h] = row[idx] ?? '';
    });
    return obj;
  });
}

export function checkBackupReminder(lastBackupDateStr?: string): { isOverdue: boolean; daysAgo: number } {
  if (!lastBackupDateStr) {
    return { isOverdue: true, daysAgo: 99 };
  }
  const lastDate = new Date(lastBackupDateStr).getTime();
  const now = Date.now();
  const diffDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
  return {
    isOverdue: diffDays >= 7,
    daysAgo: diffDays,
  };
}
