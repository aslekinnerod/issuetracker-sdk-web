import { afterEach, describe, expect, it, vi } from 'vitest';

// Shared state the html2canvas mock writes to, hoisted so the vi.mock
// factory (which is hoisted above imports) can reference it.
const h = vi.hoisted(() => ({
  fullCanvas: { toDataURL: () => 'data:image/jpeg;base64,FULL' } as unknown as HTMLCanvasElement,
  // Records the root/body overflow at the moment html2canvas runs, so a
  // test can assert it was neutralized during the capture.
  overflowAtCapture: { root: '', body: '' },
}));

// html2canvas is dynamically imported by screenshot.ts; mock it so the
// test never touches a real renderer.
vi.mock('html2canvas', () => ({
  default: vi.fn(async () => {
    h.overflowAtCapture.root = document.documentElement.style.overflow;
    h.overflowAtCapture.body = document.body.style.overflow;
    return h.fullCanvas;
  }),
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
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  });

  it('crops the full render to the viewport at the current scroll offset', async () => {
    setViewport(120, 1500, 800, 600);
    const { drawImage, viewCanvas } = mockViewCanvas();

    const { captureScreenshot } = await import('./screenshot');
    const result = await captureScreenshot();

    expect(viewCanvas.width).toBe(800);
    expect(viewCanvas.height).toBe(600);
    // Source rect starts at the live scroll offset — a scrolled-down
    // page used to capture the top.
    expect(drawImage).toHaveBeenCalledWith(h.fullCanvas, 120, 1500, 800, 600, 0, 0, 800, 600);
    expect(result).toBe('data:image/jpeg;base64,CROPPED');
  });

  it('forces overflow visible during capture and restores it afterward', async () => {
    setViewport(0, 1000, 800, 600);
    // Simulate the common `overflow-x: hidden` case (computes to a
    // non-visible overflow that breaks html2canvas scroll detection).
    document.documentElement.style.overflow = 'scroll';
    document.body.style.overflow = 'hidden';
    mockViewCanvas();

    const { captureScreenshot } = await import('./screenshot');
    await captureScreenshot();

    expect(h.overflowAtCapture).toEqual({ root: 'visible', body: 'visible' });
    expect(document.documentElement.style.overflow).toBe('scroll');
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('restores overflow even when html2canvas throws', async () => {
    setViewport(0, 0, 800, 600);
    document.body.style.overflow = 'hidden';
    const html2canvas = (await import('html2canvas')).default as unknown as ReturnType<typeof vi.fn>;
    html2canvas.mockRejectedValueOnce(new Error('tainted canvas'));

    const { captureScreenshot } = await import('./screenshot');
    const result = await captureScreenshot();

    expect(result).toBeNull();
    expect(document.body.style.overflow).toBe('hidden');
  });
});
