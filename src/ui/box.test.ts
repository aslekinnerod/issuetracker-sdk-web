import { describe, expect, it } from 'vitest';
import { applyBoxKey, initialBox, minSize, moveBox, resizeBox, stepFor } from './box';

// Highlight-box geometry (ISU-38). Pure canvas-coordinate math — the
// DOM overlay and keydown wiring in editor.ts delegate here.

const W = 1000;
const H = 600;

describe('initialBox', () => {
  it('spans ~30% of each dimension, centered', () => {
    const b = initialBox(W, H);
    expect(b).toEqual({ x: 350, y: 210, w: 300, h: 180 });
    // Centered: equal margins on both sides.
    expect(b.x * 2 + b.w).toBe(W);
    expect(b.y * 2 + b.h).toBe(H);
  });
});

describe('moveBox', () => {
  it('translates by the given delta', () => {
    const b = moveBox({ x: 100, y: 100, w: 200, h: 100 }, 20, -12, W, H);
    expect(b).toEqual({ x: 120, y: 88, w: 200, h: 100 });
  });

  it('clamps so the box stays fully on the canvas', () => {
    const rect = { x: 100, y: 100, w: 200, h: 100 };
    expect(moveBox(rect, -9999, -9999, W, H)).toEqual({ ...rect, x: 0, y: 0 });
    expect(moveBox(rect, 9999, 9999, W, H)).toEqual({ ...rect, x: W - 200, y: H - 100 });
  });
});

describe('resizeBox', () => {
  it('grows from the bottom-right, clamped to the canvas edges', () => {
    const rect = { x: 800, y: 500, w: 100, h: 50 };
    const b = resizeBox(rect, 9999, 9999, W, H);
    expect(b).toEqual({ ...rect, w: W - rect.x, h: H - rect.y });
  });

  it('never shrinks below the minimum size', () => {
    const b = resizeBox({ x: 0, y: 0, w: 300, h: 180 }, -9999, -9999, W, H);
    expect(b.w).toBe(minSize(W));
    expect(b.h).toBe(minSize(H));
  });
});

describe('applyBoxKey', () => {
  const rect = { x: 350, y: 210, w: 300, h: 180 };

  it('plain arrows move by ~2% of the canvas dimension', () => {
    expect(applyBoxKey(rect, 'ArrowRight', false, W, H)).toEqual({ ...rect, x: 350 + stepFor(W) });
    expect(applyBoxKey(rect, 'ArrowUp', false, W, H)).toEqual({ ...rect, y: 210 - stepFor(H) });
  });

  it('Shift+arrows resize from the bottom-right instead of moving', () => {
    expect(applyBoxKey(rect, 'ArrowRight', true, W, H)).toEqual({ ...rect, w: 300 + stepFor(W) });
    expect(applyBoxKey(rect, 'ArrowUp', true, W, H)).toEqual({ ...rect, h: 180 - stepFor(H) });
  });

  it('returns null for non-arrow keys so the event falls through', () => {
    expect(applyBoxKey(rect, 'Enter', false, W, H)).toBeNull();
    expect(applyBoxKey(rect, 'a', false, W, H)).toBeNull();
  });
});
