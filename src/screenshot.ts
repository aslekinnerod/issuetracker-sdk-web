/**
 * Captures the currently visible viewport into a JPEG data URL via
 * html2canvas. Returns null on environments without DOM, or if
 * html2canvas fails (e.g. tainted canvas from cross-origin images).
 *
 * Captures only what the user actually sees — not the entire scrollable
 * document. A user reporting "this dropdown is broken" wants the
 * dropdown in the screenshot, not 3000 px of off-screen content.
 *
 * html2canvas is bundled into our own dist (see tsup noExternal) and
 * loaded via dynamic import, so the ~140 KB chunk only downloads when
 * the user actually triggers a report.
 */
export async function captureScreenshot(): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  try {
    const { default: html2canvas } = await import('html2canvas');

    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    // Render the whole page in document coordinates, then crop to the
    // viewport ourselves. scrollX/scrollY: 0 is load-bearing: by
    // default html2canvas offsets the render by the current scroll, and
    // on pages whose <body> has overflow != visible (e.g. the very
    // common `overflow-x: hidden`, which computes to `hidden auto`) it
    // double-applies that offset — pushing the content down by scrollY
    // so the crop lands on the top of the page instead of the viewport.
    // Pinning the scroll to 0 makes the render deterministic (page-y
    // maps 1:1 to canvas-y) regardless of the host page's overflow.
    // scale: 1 keeps retina screens from producing multi-MB images that
    // breach the callable payload limit.
    const full = await html2canvas(document.body, {
      logging: false,
      useCORS: true,
      scale: 1,
      scrollX: 0,
      scrollY: 0,
    });

    const view = document.createElement('canvas');
    view.width = window.innerWidth;
    view.height = window.innerHeight;
    const ctx = view.getContext('2d');
    if (!ctx) return full.toDataURL('image/jpeg', 0.85);
    ctx.drawImage(
      full,
      scrollX,
      scrollY,
      window.innerWidth,
      window.innerHeight,
      0,
      0,
      window.innerWidth,
      window.innerHeight,
    );
    return view.toDataURL('image/jpeg', 0.85);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[Issuetracker] screenshot capture failed', e);
    return null;
  }
}
