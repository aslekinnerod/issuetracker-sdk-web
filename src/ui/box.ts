/**
 * Geometry + keyboard state logic for the editor's "Add box" tool
 * (ISU-38, WCAG 2.5.7 / 2.1.1).
 *
 * A highlight box is a rectangle-outline annotation placed without any
 * dragging: activation drops it at the canvas center, arrow keys move
 * it, Shift+arrows resize it from the bottom-right corner, Enter
 * commits it into the bitmap, Escape/Delete removes it. All values are
 * in canvas *bitmap* coordinates — the editor converts to CSS pixels
 * only when positioning the DOM overlay, so committing needs no
 * devicePixelRatio math.
 *
 * Kept free of DOM so it is unit-testable without a canvas.
 */

export interface BoxRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Fraction of the canvas dimension the initial box spans. */
const INITIAL_FRACTION = 0.3;
/** Arrow-key step as a fraction of the canvas dimension (~2%). */
const STEP_FRACTION = 0.02;
/** Minimum box size as a fraction of the canvas dimension. */
const MIN_FRACTION = 0.05;

export function stepFor(dimension: number): number {
  return Math.max(1, Math.round(dimension * STEP_FRACTION));
}

export function minSize(dimension: number): number {
  return Math.max(8, Math.round(dimension * MIN_FRACTION));
}

/** Centered box spanning ~30% of each canvas dimension. */
export function initialBox(canvasW: number, canvasH: number): BoxRect {
  const w = Math.round(canvasW * INITIAL_FRACTION);
  const h = Math.round(canvasH * INITIAL_FRACTION);
  return {
    x: Math.round((canvasW - w) / 2),
    y: Math.round((canvasH - h) / 2),
    w,
    h,
  };
}

/** Translate by (dx, dy), clamped so the box stays fully on the canvas. */
export function moveBox(
  box: BoxRect,
  dx: number,
  dy: number,
  canvasW: number,
  canvasH: number,
): BoxRect {
  return {
    ...box,
    x: Math.min(Math.max(0, box.x + dx), Math.max(0, canvasW - box.w)),
    y: Math.min(Math.max(0, box.y + dy), Math.max(0, canvasH - box.h)),
  };
}

/**
 * Resize from the bottom-right corner by (dw, dh), clamped to the
 * canvas edges and to a minimum size.
 */
export function resizeBox(
  box: BoxRect,
  dw: number,
  dh: number,
  canvasW: number,
  canvasH: number,
): BoxRect {
  return {
    ...box,
    w: Math.min(Math.max(minSize(canvasW), box.w + dw), canvasW - box.x),
    h: Math.min(Math.max(minSize(canvasH), box.h + dh), canvasH - box.y),
  };
}

/**
 * Applies one arrow-key press: plain arrows move, Shift+arrows resize
 * from the bottom-right. Returns the new rect, or null when the key is
 * not an arrow key (caller lets the event through).
 */
export function applyBoxKey(
  box: BoxRect,
  key: string,
  shift: boolean,
  canvasW: number,
  canvasH: number,
): BoxRect | null {
  const sx = stepFor(canvasW);
  const sy = stepFor(canvasH);
  let dx = 0;
  let dy = 0;
  switch (key) {
    case 'ArrowLeft':
      dx = -sx;
      break;
    case 'ArrowRight':
      dx = sx;
      break;
    case 'ArrowUp':
      dy = -sy;
      break;
    case 'ArrowDown':
      dy = sy;
      break;
    default:
      return null;
  }
  return shift
    ? resizeBox(box, dx, dy, canvasW, canvasH)
    : moveBox(box, dx, dy, canvasW, canvasH);
}
