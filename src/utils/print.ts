import { inEmbeddedFrame, notifyUser } from './export';

export function safePrint() {
  try {
    window.print();
  } catch (err) {
    console.error('Print failed', err);
  }
  if (inEmbeddedFrame() || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
    notifyUser('Printing is blocked here. Open the app in its own browser tab and use Print → Save as PDF.');
  }
}
