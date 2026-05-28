import { afterEach, describe, expect, it, vi } from 'vitest';

const fullCanvas = { toDataURL: vi.fn(() => 'data:image/jpeg;base64,FULL') };

// html2canvas is dynamically imported by screenshot.ts; mock it so the
// test never touches a real renderer and we can assert how its output
// is cropped.
vi.mock('html2canvas', () => ({
  default: vi.fn(async () => fullCanvas),
}));

function setViewport(scrollX: number, scrollY: number, w: number, h: number) {
  Object.defineProperty(window, 'scrollX', { value: scrollX, configurable: true });
  Object.defineProperty(window, 'scrollY', { value: scrollY, configurable: true });
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
}

describe('captureScreenshot viewport cropping', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('crops the full render to the viewport at the current scroll offset', async () => {
    setViewport(120, 1500, 800, 600);

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

    const { captureScreenshot } = await import('./screenshot');
    const result = await captureScreenshot();

    expect(viewCanvas.width).toBe(800);
    expect(viewCanvas.height).toBe(600);
    // Source rect starts at the live scroll offset — this is what was
    // broken before: a scrolled-down page used to capture the top.
    expect(drawImage).toHaveBeenCalledWith(fullCanvas, 120, 1500, 800, 600, 0, 0, 800, 600);
    expect(result).toBe('data:image/jpeg;base64,CROPPED');
  });
});
