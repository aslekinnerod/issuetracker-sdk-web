/**
 * Captures the currently visible viewport into a JPEG data URL via
 * html2canvas. Returns null on environments without DOM, or if
 * html2canvas fails (e.g. tainted canvas from cross-origin images).
 *
 * Captures only what the user actually sees — not the entire scrollable
 * document. A user reporting "this dropdown is broken" wants the
 * dropdown in the screenshot, not 3000 px of off-screen content.
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
      // Crop to the visible viewport. Without this, html2canvas
      // captures the whole document.body — including everything
      // scrolled out of view.
      x: window.scrollX,
      y: window.scrollY,
      width: window.innerWidth,
      height: window.innerHeight,
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
