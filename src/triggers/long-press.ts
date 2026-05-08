const HOLD_MS = 3000;
const MOVE_TOLERANCE_PX_SQ = 900; // 30px²

let installed = false;
let handler: (() => void) | null = null;

/**
 * Two-finger long-press for 3 seconds. Two fingers — not one — to
 * avoid clashing with native context menus and text selection.
 * Cancelled if either finger moves more than 30 px from its starting
 * position.
 */
export function installLongPress(onTrigger: () => void): void {
  handler = onTrigger;
  if (installed || typeof window === 'undefined') return;
  installed = true;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let start: { x: number; y: number }[] = [];

  const cancel = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
    start = [];
  };

  window.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length !== 2) {
        cancel();
        return;
      }
      start = Array.from(e.touches).map((t) => ({ x: t.clientX, y: t.clientY }));
      timer = setTimeout(() => {
        handler?.();
        cancel();
      }, HOLD_MS);
    },
    { passive: true },
  );

  window.addEventListener(
    'touchmove',
    (e) => {
      if (!timer || e.touches.length !== 2) return;
      const moved = Array.from(e.touches).some((t, i) => {
        const s = start[i];
        if (!s) return true;
        const dx = t.clientX - s.x;
        const dy = t.clientY - s.y;
        return dx * dx + dy * dy > MOVE_TOLERANCE_PX_SQ;
      });
      if (moved) cancel();
    },
    { passive: true },
  );

  window.addEventListener('touchend', cancel, { passive: true });
  window.addEventListener('touchcancel', cancel, { passive: true });
}
