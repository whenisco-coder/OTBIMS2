// print.ts
import { inEmbeddedFrame, notifyUser } from './export';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export async function safePrint(element: HTMLElement, filename = 'document.pdf') {
  if (isMobile || inEmbeddedFrame()) {
    notifyUser('Printing is not available here — downloading a PDF instead.');
    return downloadPdf(element, filename);
  }
  try {
    window.print();
  } catch (err) {
    console.error('Print failed', err);
    notifyUser('Print blocked — downloading a PDF instead.');
    downloadPdf(element, filename);
  }
}

export async function downloadPdf(element: HTMLElement, filename = 'document.pdf') {
  const canvas = await html2canvas(element, { scale: 2, useCORS: true });
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });

  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const imgW = pageW - 48;
  const imgH = (canvas.height * imgW) / canvas.width;
  const img = canvas.toDataURL('image/jpeg', 0.9);

  const pages = Math.ceil(imgH / (pageH - 48));
  for (let i = 0; i < pages; i++) {
    if (i) pdf.addPage();
    pdf.addImage(img, 'JPEG', 24, 24 - i * (pageH - 48), imgW, imgH);
  }
  pdf.save(filename);
}
