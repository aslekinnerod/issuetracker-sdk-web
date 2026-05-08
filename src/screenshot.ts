/**
 * Captures the current document into a JPEG data URL via html2canvas.
 * Returns null on environments without DOM, or if html2canvas fails
 * (e.g. tainted canvas from cross-origin images).
 *
 * Loaded via dynamic import so the html2canvas bundle (~140 KB) only
 * downloads when the user actually triggers a report. Modern bundlers
 * code-split it; for the IIFE bundle it's inlined.
 */
export async function captureScreenshot(): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  try {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(document.body, {
      logging: false,
      useCORS: true,
      // Cap at 1x device pixel ratio so retina screens don't produce
      // multi-MB screenshots that breach the callable payload limit.
      scale: 1,
    });
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[Issuetracker] screenshot capture failed', e);
    return null;
  }
}
