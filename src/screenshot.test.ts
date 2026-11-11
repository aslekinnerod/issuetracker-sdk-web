import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  fullCanvas: { toDataURL: () => 'data:image/jpeg;base64,FULL' } as unknown as HTMLCanvasElement,
}));

// html2canvas is dynamically imported by screenshot.ts; mock it so the
// test never touches a real renderer.
vi.mock('html2canvas-pro', () => ({
  default: vi.fn(async () => h.fullCanvas),
}));

function setViewport(scrollX: number, scrollY: number, w: number, height: number) {
  Object.defineProperty(window, 'scrollX', { value: scrollX, configurable: true });
  Object.defineProperty(window, 'scrollY', { value: scrollY, configurable: true });
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

function mockViewCanvas() {
  const drawImage = vi.fn();
  const viewCanvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({ drawImage })),
    toDataURL: vi.fn(() => 'data:image/jpeg;base64,CROPPED'),
  };
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
    tag === 'canvas' ? (viewCanvas as unknown as HTMLCanvasElement) : realCreate(tag),
  );
  return { drawImage, viewCanvas };
}

describe('captureScreenshot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('renders in document coordinates (scroll pinned to 0) and crops to the viewport', async () => {
    setViewport(120, 1500, 800, 600);
    const { drawImage, viewCanvas } = mockViewCanvas();

    const { captureScreenshot } = await import('./screenshot');
    const html2canvas = (await import('html2canvas-pro')).default as unknown as ReturnType<typeof vi.fn>;
    const result = await captureScreenshot();

    // scrollX/scrollY: 0 is what prevents html2canvas from double-
    // applying the scroll offset on overflow != visible pages.
    expect(html2canvas).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({ scrollX: 0, scrollY: 0, scale: 1 }),
    );
    expect(viewCanvas.width).toBe(800);
    expect(viewCanvas.height).toBe(600);
    // The crop source rect starts at the live scroll offset.
    expect(drawImage).toHaveBeenCalledWith(h.fullCanvas, 120, 1500, 800, 600, 0, 0, 800, 600);
    expect(result).toBe('data:image/jpeg;base64,CROPPED');
  });

  it('returns null when html2canvas throws', async () => {
    setViewport(0, 0, 800, 600);
    const html2canvas = (await import('html2canvas-pro')).default as unknown as ReturnType<typeof vi.fn>;
    html2canvas.mockRejectedValueOnce(new Error('tainted canvas'));

    const { captureScreenshot } = await import('./screenshot');
    const result = await captureScreenshot();

    expect(result).toBeNull();
  });

  it('swaps <video> for a placeholder during capture and restores it after', async () => {
    setViewport(0, 0, 800, 600);
    mockViewCanvas();
    const video = document.createElement('video');
    document.body.appendChild(video);
    const baselineChildren = document.body.children.length;

    let stateDuringCapture: { videoHidden: boolean; bodyChildren: number } | undefined;
    const html2canvas = (await import('html2canvas-pro')).default as unknown as ReturnType<typeof vi.fn>;
    html2canvas.mockImplementationOnce(async () => {
      stateDuringCapture = {
        videoHidden: video.style.display === 'none',
        bodyChildren: document.body.children.length,
      };
      return h.fullCanvas;
    });

    const { captureScreenshot } = await import('./screenshot');
    await captureScreenshot();

    // During capture the video is hidden and a placeholder sits next to it.
    expect(stateDuringCapture?.videoHidden).toBe(true);
    expect(stateDuringCapture?.bodyChildren).toBe(baselineChildren + 1);
    // Afterwards the DOM is back to how it was.
    expect(video.style.display).toBe('');
    expect(document.body.children.length).toBe(baselineChildren);

    document.body.removeChild(video);
  });
  it('restores scroll offsets instantly by pinning scroll-behavior on scrolled elements', async () => {
    setViewport(0, 0, 800, 600);
    mockViewCanvas();
    const panel = document.createElement('nav');
    panel.style.setProperty('scroll-behavior', 'smooth');
    document.body.appendChild(panel);
    Object.defineProperty(panel, 'scrollTop', { value: 900, configurable: true });

    let during: string | undefined;
    const html2canvas = (await import('html2canvas-pro')).default as unknown as ReturnType<typeof vi.fn>;
    html2canvas.mockImplementationOnce(async () => {
      during = `${panel.style.getPropertyValue('scroll-behavior')} ${panel.style.getPropertyPriority('scroll-behavior')}`;
      return h.fullCanvas;
    });

    const { captureScreenshot } = await import('./screenshot');
    await captureScreenshot();

    expect(during).toBe('auto important');
    expect(panel.style.getPropertyValue('scroll-behavior')).toBe('smooth');
    document.body.removeChild(panel);
  });

  it('renders a visible same-origin iframe on its own and swaps it for that image', async () => {
    setViewport(0, 0, 800, 600);
    mockViewCanvas();
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    const inner = document.implementation.createHTMLDocument('preview');
    Object.defineProperty(inner, 'defaultView', { value: window });
    Object.defineProperty(frame, 'contentDocument', { value: inner, configurable: true });
    frame.getBoundingClientRect = () => ({ top: 10, left: 10, bottom: 410, right: 610, width: 600, height: 400 }) as DOMRect;
    const baselineChildren = document.body.children.length;

    const html2canvas = (await import('html2canvas-pro')).default as unknown as ReturnType<typeof vi.fn>;
    let during: { hidden: boolean; ignored: boolean; placeholderBg: string; bodyChildren: number } | undefined;
    html2canvas.mockImplementationOnce(async () => h.fullCanvas); // the frame's own document
    html2canvas.mockImplementationOnce(async () => {
      const placeholder = frame.previousElementSibling as HTMLElement | null;
      during = {
        hidden: frame.style.display === 'none',
        ignored: frame.hasAttribute('data-html2canvas-ignore'),
        placeholderBg: placeholder?.style.backgroundImage ?? '',
        bodyChildren: document.body.children.length,
      };
      return h.fullCanvas;
    });

    const { captureScreenshot } = await import('./screenshot');
    await captureScreenshot();

    expect(html2canvas).toHaveBeenNthCalledWith(1, inner.body, expect.anything());
    expect(html2canvas).toHaveBeenNthCalledWith(2, document.body, expect.anything());
    expect(during?.hidden).toBe(true);
    expect(during?.ignored).toBe(true);
    expect(during?.placeholderBg).toContain('CROPPED');
    expect(during?.bodyChildren).toBe(baselineChildren + 1);
    expect(frame.style.display).toBe('');
    expect(frame.hasAttribute('data-html2canvas-ignore')).toBe(false);
    expect(document.body.children.length).toBe(baselineChildren);
    document.body.removeChild(frame);
  });

  it('leaves cross-origin and off-screen iframes alone', async () => {
    setViewport(0, 0, 800, 600);
    mockViewCanvas();
    const crossOrigin = document.createElement('iframe');
    Object.defineProperty(crossOrigin, 'contentDocument', { value: null, configurable: true });
    const offscreen = document.createElement('iframe');
    const inner = document.implementation.createHTMLDocument('below');
    Object.defineProperty(inner, 'defaultView', { value: window });
    Object.defineProperty(offscreen, 'contentDocument', { value: inner, configurable: true });
    offscreen.getBoundingClientRect = () => ({ top: 2000, left: 0, bottom: 2400, right: 600, width: 600, height: 400 }) as DOMRect;
    document.body.append(crossOrigin, offscreen);

    const html2canvas = (await import('html2canvas-pro')).default as unknown as ReturnType<typeof vi.fn>;
    const { captureScreenshot } = await import('./screenshot');
    const result = await captureScreenshot();

    expect(html2canvas).toHaveBeenCalledTimes(1);
    expect(html2canvas).toHaveBeenCalledWith(document.body, expect.anything());
    expect(result).toBe('data:image/jpeg;base64,CROPPED');
    crossOrigin.remove();
    offscreen.remove();
  });
});
