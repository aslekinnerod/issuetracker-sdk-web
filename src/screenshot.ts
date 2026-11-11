/**
 * Captures the currently visible viewport into a JPEG data URL via
 * html2canvas. Returns null on environments without DOM, or if
 * html2canvas fails (e.g. tainted canvas from cross-origin images).
 *
 * Captures only what the user actually sees — not the entire scrollable
 * document. A user reporting "this dropdown is broken" wants the
 * dropdown in the screenshot, not 3000 px of off-screen content.
 *
 * html2canvas-pro is bundled into our own dist (see tsup noExternal)
 * and loaded via dynamic import, so the chunk only downloads when the
 * user actually triggers a report. The -pro fork is API-compatible and
 * adds support for modern CSS color functions (oklch/oklab/lab/lch/
 * color()) that Tailwind v4 and fresh design systems emit — upstream
 * html2canvas 1.4 throws "unsupported color function" on those pages,
 * silently killing screenshots for every such host app.
 */
export async function captureScreenshot(): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  try {
    const view = await renderViewport(document, 0, Date.now() + FRAME_BUDGET_MS);
    return view.toDataURL('image/jpeg', 0.85);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[Issuetracker] screenshot capture failed', e);
    return null;
  }
}

// Same-origin iframes are rendered on their own and pasted in (see
// swapFramesForSnapshots). Each one costs a full html2canvas pass, so
// the whole set shares one time budget and nesting stops after a
// couple of levels; frames that miss the budget stay as html2canvas
// draws them, which is an empty box.
const FRAME_BUDGET_MS = 3000;
const MAX_FRAME_DEPTH = 2;

/**
 * Renders what is visible in `doc`'s viewport. Called for the host page
 * and, recursively, for each visible same-origin iframe.
 */
async function renderViewport(doc: Document, depth: number, deadline: number): Promise<HTMLCanvasElement> {
  const win = doc.defaultView;
  if (!win) throw new Error('document has no window');
  // html2canvas can't render <video> and lays it out larger than its CSS
  // box, ignoring any overflow:hidden clipping on the container — which
  // pushes everything below the video down, so the crop misses the
  // viewport. Swap each video for a placeholder that occupies the exact
  // same box, capture, then restore. Verified to bring the offset to 0
  // on a real video-hero page.
  const videoSwaps = swapVideosForPlaceholders(doc);
  const scrollPins = pinScrollBehavior(doc);
  let frameSwaps: FrameSwap[] = [];
  try {
    if (depth < MAX_FRAME_DEPTH) frameSwaps = await swapFramesForSnapshots(doc, depth, deadline);

    const { default: html2canvas } = await import('html2canvas-pro');

    const scrollX = win.scrollX;
    const scrollY = win.scrollY;

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
    const full = await html2canvas(doc.body, {
      logging: false,
      useCORS: true,
      scale: 1,
      scrollX: 0,
      scrollY: 0,
    });

    const view = document.createElement('canvas');
    view.width = win.innerWidth;
    view.height = win.innerHeight;
    const ctx = view.getContext('2d');
    if (!ctx) return full;
    ctx.drawImage(
      full,
      scrollX,
      scrollY,
      win.innerWidth,
      win.innerHeight,
      0,
      0,
      win.innerWidth,
      win.innerHeight,
    );
    return view;
  } finally {
    restoreFrames(frameSwaps);
    restoreScrollBehavior(scrollPins);
    restoreVideos(videoSwaps);
  }
}

interface VideoSwap {
  video: HTMLVideoElement;
  placeholder: HTMLElement;
  prevDisplay: string;
}

// Box-geometry properties copied onto the placeholder so it occupies the
// identical layout box as the video it stands in for (including absolute
// positioning and transforms).
const PLACEHOLDER_PROPS = [
  'position',
  'top',
  'left',
  'right',
  'bottom',
  'width',
  'height',
  'margin',
  'transform',
  'z-index',
  'border-radius',
];

function swapVideosForPlaceholders(doc: Document): VideoSwap[] {
  const swaps: VideoSwap[] = [];
  doc.querySelectorAll('video').forEach((video) => {
    const parent = video.parentNode;
    if (!parent) return;
    const cs = doc.defaultView!.getComputedStyle(video);
    const placeholder = doc.createElement('div');
    PLACEHOLDER_PROPS.forEach((p) => placeholder.style.setProperty(p, cs.getPropertyValue(p)));
    if (video.poster) {
      placeholder.style.backgroundImage = `url("${video.poster}")`;
      placeholder.style.backgroundSize = cs.getPropertyValue('object-fit') === 'contain' ? 'contain' : 'cover';
      placeholder.style.backgroundPosition = 'center';
    }
    const prevDisplay = video.style.display;
    video.style.display = 'none';
    parent.insertBefore(placeholder, video);
    swaps.push({ video, placeholder, prevDisplay });
  });
  return swaps;
}

function restoreVideos(swaps: VideoSwap[]): void {
  swaps.forEach(({ video, placeholder, prevDisplay }) => {
    placeholder.remove();
    video.style.display = prevDisplay;
  });
}

interface FrameSwap {
  frame: HTMLIFrameElement;
  placeholder: HTMLElement;
  prevDisplay: string;
  prevIgnore: string | null;
}

// html2canvas skips elements carrying this attribute when it copies the
// page, so the hidden frame isn't loaded a second time inside the copy.
const IGNORE_ATTR = 'data-html2canvas-ignore';

// An iframe's box also carries its border and padding (the content sits
// inside them), and it is inline by default, so the placeholder needs
// more of the layout than a video's does to land on the same pixels.
const FRAME_PLACEHOLDER_PROPS = [
  ...PLACEHOLDER_PROPS,
  'box-sizing',
  'vertical-align',
  'flex',
  'align-self',
  'grid-area',
  'background-color',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
];

// html2canvas clones an iframe as an empty element, so the copy reloads
// the frame's URL and gets read before the page inside has rendered —
// the screenshot shows only the frame's background (Manual Studio's
// manual preview came out solid grey). For each visible same-origin
// frame we render its document ourselves and put that image in its
// place, like the video swap above. Cross-origin frames can't be read
// and are left alone.
async function swapFramesForSnapshots(doc: Document, depth: number, deadline: number): Promise<FrameSwap[]> {
  const win = doc.defaultView!;
  const swaps: FrameSwap[] = [];
  for (const frame of Array.from(doc.querySelectorAll('iframe'))) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    if (frame.hasAttribute(IGNORE_ATTR)) continue;
    let inner: Document | null = null;
    try {
      inner = frame.contentDocument;
    } catch {
      // cross-origin
    }
    if (!inner?.body || !frame.parentNode) continue;
    const r = frame.getBoundingClientRect();
    const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < win.innerHeight && r.left < win.innerWidth;
    if (!visible) continue;

    let snapshot: HTMLCanvasElement;
    try {
      snapshot = await withTimeout(renderViewport(inner, depth + 1, deadline), remaining);
    } catch {
      continue;
    }

    const cs = win.getComputedStyle(frame);
    const placeholder = doc.createElement('div');
    FRAME_PLACEHOLDER_PROPS.forEach((p) => placeholder.style.setProperty(p, cs.getPropertyValue(p)));
    placeholder.style.display = cs.display === 'inline' ? 'inline-block' : cs.display;
    placeholder.style.backgroundImage = `url("${snapshot.toDataURL('image/png')}")`;
    placeholder.style.backgroundOrigin = 'content-box';
    placeholder.style.backgroundClip = 'content-box';
    placeholder.style.backgroundRepeat = 'no-repeat';
    placeholder.style.backgroundSize = '100% 100%';
    const prevDisplay = frame.style.display;
    const prevIgnore = frame.getAttribute(IGNORE_ATTR);
    frame.style.display = 'none';
    frame.setAttribute(IGNORE_ATTR, 'true');
    frame.parentNode.insertBefore(placeholder, frame);
    swaps.push({ frame, placeholder, prevDisplay, prevIgnore });
  }
  return swaps;
}

function restoreFrames(swaps: FrameSwap[]): void {
  swaps.forEach(({ frame, placeholder, prevDisplay, prevIgnore }) => {
    placeholder.remove();
    frame.style.display = prevDisplay;
    if (prevIgnore === null) frame.removeAttribute(IGNORE_ATTR);
    else frame.setAttribute(IGNORE_ATTR, prevIgnore);
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

interface ScrollPin {
  el: HTMLElement;
  prevValue: string;
  prevPriority: string;
}

// html2canvas puts each scrolled element's scroll offset back on its
// copy, but under `scroll-behavior: smooth` that starts an animation
// instead of jumping, and the render reads the layout before it has
// moved — scrolled panels come out at the top. Forcing `auto` inline on
// the originals carries over to the copies (inline style is cloned) and
// makes the restore instant; nothing scrolls in the live page.
function pinScrollBehavior(doc: Document): ScrollPin[] {
  const pins: ScrollPin[] = [];
  doc.querySelectorAll<HTMLElement>('*').forEach((el) => {
    if (el.scrollTop === 0 && el.scrollLeft === 0) return;
    pins.push({
      el,
      prevValue: el.style.getPropertyValue('scroll-behavior'),
      prevPriority: el.style.getPropertyPriority('scroll-behavior'),
    });
    el.style.setProperty('scroll-behavior', 'auto', 'important');
  });
  return pins;
}

function restoreScrollBehavior(pins: ScrollPin[]): void {
  pins.forEach(({ el, prevValue, prevPriority }) => {
    if (prevValue) el.style.setProperty('scroll-behavior', prevValue, prevPriority);
    else el.style.removeProperty('scroll-behavior');
  });
}
