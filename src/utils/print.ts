import { inEmbeddedFrame, notifyUser } from './export';

/**
 * window.print() with a safety net. Inside an embedded preview frame the browser silently ignores it,
 * so we tell the user what to do instead of leaving them with a dead button.
 */
export function safePrint() {
  try {
    window.print();
  } catch (err) {
    console.error('Print failed', err);
  }
  if (inEmbeddedFrame()) {
    notifyUser(
      'If no print screen opened: printing is blocked inside this embedded view. Open the app in its own browser tab, or use the Save PDF button on the invoice.'
    );
  }
}
