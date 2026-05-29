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
  const root = document.documentElement;
  const body = document.body;
  const prevRootOverflow = root.style.overflow;
  const prevBodyOverflow = body.style.overflow;
  try {
    const { default: html2canvas } = await import('html2canvas');
    // html2canvas mis-detects the scroll position when the root
    // elements have overflow != visible — and `overflow-x: hidden`
    // (a very common way to suppress horizontal scroll) computes to
    // `overflow: hidden auto`. It then shifts the whole render down by
    // scrollY, so the crop below lands on the top of the page instead
    // of the viewport. Forcing overflow visible for the duration of
    // the capture restores correct scroll detection; we put it back in
    // the finally block.
    root.style.overflow = 'visible';
    body.style.overflow = 'visible';

    // Render the full page, then crop to the viewport ourselves.
    // html2canvas' own x/y/width/height crop options normalize scroll
    // in the cloned document, so cropping at scrollY lands on the wrong
    // region. Rendering everything and cropping via drawImage with the
    // live scroll offset reliably yields exactly what the user sees.
    // scale: 1 keeps retina screens from producing multi-MB images
    // that breach the callable payload limit.
    const full = await html2canvas(body, {
      logging: false,
      useCORS: true,
      scale: 1,
    });

    const view = document.createElement('canvas');
    view.width = window.innerWidth;
    view.height = window.innerHeight;
    const ctx = view.getContext('2d');
    if (!ctx) return full.toDataURL('image/jpeg', 0.85);
    ctx.drawImage(
      full,
      window.scrollX,
      window.scrollY,
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
  } finally {
    root.style.overflow = prevRootOverflow;
    body.style.overflow = prevBodyOverflow;
  }
}
