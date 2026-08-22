/**
 * Shared modal focus management for the SDK's shadow-DOM overlays
 * (reporter flow, terminated view, onboarding popover).
 *
 * Responsibilities:
 * - Capture the element focused before the modal opened and restore
 *   focus to it on release (WCAG 2.4.3).
 * - Trap Tab / Shift+Tab within the modal's tabbable elements.
 * - Route Escape to the current cancel/close path (handler is mutable
 *   because the reporter swaps screens — name prompt, form, editor,
 *   terminated — inside one shadow root).
 * - Make the rest of the host page unreachable while the modal is up:
 *   `inert` where supported (blocks focus AND hides from the a11y
 *   tree), `aria-hidden` as a fallback. Only elements this manager
 *   actually flipped are tracked, so nested modals and host-owned
 *   inert/aria-hidden attributes are left untouched on release.
 */

export interface ModalFocusManager {
  /** Swap what Escape does — call whenever the modal switches screens. */
  setEscapeHandler(fn: () => void): void;
  /** Undo everything: listeners, inert/aria-hidden, focus restore. Idempotent. */
  release(): void;
}

const TABBABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getTabbables(shadow: ShadowRoot): HTMLElement[] {
  return Array.from(shadow.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR)).filter(
    // Filters out display:none elements (e.g. conditionally hidden rows).
    (el) => el.getClientRects().length > 0,
  );
}

export function manageModalFocus(host: HTMLElement, shadow: ShadowRoot): ModalFocusManager {
  const previouslyFocused = document.activeElement as HTMLElement | null;
  let escapeHandler: (() => void) | null = null;

  const supportsInert =
    typeof HTMLElement !== 'undefined' && 'inert' in HTMLElement.prototype;
  const backgrounded: HTMLElement[] = [];
  for (const el of Array.from(document.body.children)) {
    if (el === host || !(el instanceof HTMLElement)) continue;
    if (supportsInert) {
      if (el.inert) continue;
      el.inert = true;
      backgrounded.push(el);
    } else {
      if (el.hasAttribute('aria-hidden')) continue;
      el.setAttribute('aria-hidden', 'true');
      backgrounded.push(el);
    }
  }

  const onKeydown = (e: Event) => {
    const ke = e as KeyboardEvent;
    if (ke.key === 'Escape') {
      ke.preventDefault();
      ke.stopPropagation();
      escapeHandler?.();
      return;
    }
    if (ke.key !== 'Tab') return;
    const tabbables = getTabbables(shadow);
    if (tabbables.length === 0) {
      ke.preventDefault();
      return;
    }
    const first = tabbables[0];
    const last = tabbables[tabbables.length - 1];
    // `null` when focus somehow escaped the shadow (possible with the
    // aria-hidden fallback, which does not block focus) — pull it back.
    const current = shadow.activeElement as HTMLElement | null;
    if (ke.shiftKey) {
      if (current === first || current === null) {
        ke.preventDefault();
        last.focus();
      }
    } else if (current === last || current === null) {
      ke.preventDefault();
      first.focus();
    }
  };
  shadow.addEventListener('keydown', onKeydown);

  let released = false;
  return {
    setEscapeHandler(fn: () => void): void {
      escapeHandler = fn;
    },
    release(): void {
      if (released) return;
      released = true;
      shadow.removeEventListener('keydown', onKeydown);
      for (const el of backgrounded) {
        if (supportsInert) el.inert = false;
        else el.removeAttribute('aria-hidden');
      }
      if (previouslyFocused && previouslyFocused.isConnected) {
        try {
          previouslyFocused.focus();
        } catch {
          /* element may be unfocusable by now — nothing to restore to */
        }
      }
    },
  };
}
