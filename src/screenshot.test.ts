import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  fullCanvas: { toDataURL: () => 'data:image/jpeg;base64,FULL' } as unknown as HTMLCanvasElement,
}));

// html2canvas is dynamically imported by screenshot.ts; mock it so the
// test never touches a real renderer.
vi.mock('html2canvas', () => ({
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
    const html2canvas = (await import('html2canvas')).default as unknown as ReturnType<typeof vi.fn>;
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
    const html2canvas = (await import('html2canvas')).default as unknown as ReturnType<typeof vi.fn>;
    html2canvas.mockRejectedValueOnce(new Error('tainted canvas'));

    const { captureScreenshot } = await import('./screenshot');
    const result = await captureScreenshot();

    expect(result).toBeNull();
  });
});
