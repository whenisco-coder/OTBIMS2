import React, { useEffect, useRef, useState } from 'react';
import { FILE_READY_EVENT, NOTICE_EVENT, FileReadyDetail, shareFile } from '../../utils/export';
import { Download, ExternalLink, Share2, X } from 'lucide-react';

/**
 * Small bar that appears on phones (or inside embedded frames) after a file is created.
 * It is the "always works" backup: Open, Save and Share are real links/buttons the user taps directly,
 * which phones allow even when the automatic download was blocked.
 */
export const FileReadyBanner: React.FC = () => {
  const [file, setFile] = useState<FileReadyDetail | null>(null);
  const [notice, setNotice] = useState<string>('');
  const fileTimer = useRef<number | undefined>(undefined);
  const noticeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onFile = (e: Event) => {
      const detail = (e as CustomEvent<FileReadyDetail>).detail;
      setFile(detail);
      window.clearTimeout(fileTimer.current);
      fileTimer.current = window.setTimeout(() => setFile(null), 45000);
    };
    const onNotice = (e: Event) => {
      const msg = (e as CustomEvent<{ message: string }>).detail?.message || '';
      setNotice(msg);
      window.clearTimeout(noticeTimer.current);
      noticeTimer.current = window.setTimeout(() => setNotice(''), 12000);
    };
    window.addEventListener(FILE_READY_EVENT, onFile);
    window.addEventListener(NOTICE_EVENT, onNotice);
    return () => {
      window.removeEventListener(FILE_READY_EVENT, onFile);
      window.removeEventListener(NOTICE_EVENT, onNotice);
    };
  }, []);

  if (!file && !notice) return null;

  const handleShare = async () => {
    if (!file) return;
    try {
      const blob = await (await fetch(file.url)).blob();
      const result = await shareFile(file.filename, blob, file.mime || blob.type);
      if (result === 'unsupported') setNotice('Sharing is not available in this browser. Use Open or Save.');
    } catch {
      setNotice('Could not share. Use Open or Save.');
    }
  };

  const canShare = typeof navigator !== 'undefined' && !!(navigator as any).share;

  return (
    <div className="no-print fixed left-2 right-2 bottom-16 md:bottom-4 md:left-auto md:right-4 md:w-96 z-[70] space-y-2">
      {notice && (
        <div className="bg-amber-100 border border-amber-400 text-amber-950 text-xs p-3 shadow-lg flex items-start gap-2">
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {file && (
        <div className="bg-neutral-900 text-white border border-neutral-700 shadow-xl p-3 text-xs">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-bold">File ready</div>
              <div className="font-mono truncate text-neutral-300">{file.filename}</div>
            </div>
            <button type="button" onClick={() => setFile(null)} aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <a
              href={file.url}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-neutral-950 font-bold"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open
            </a>
            <a
              href={file.url}
              download={file.filename}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-neutral-950 font-bold"
            >
              <Download className="w-3.5 h-3.5" /> Save
            </a>
            {canShare && (
              <button
                type="button"
                onClick={handleShare}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-neutral-500 font-bold"
              >
                <Share2 className="w-3.5 h-3.5" /> Share
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
