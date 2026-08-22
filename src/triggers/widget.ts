const HOST_ID = 'issuetracker-floating-widget';
const VISIBLE_KEY = 'io.issuetracker.sdk.widget.visible';
/** Hold this long on the button to tuck it away. */
const HIDE_HOLD_MS = 600;
/**
 * The toggle combo, in the same long form describeShortcut() uses.
 * Exported so the onboarding tile quotes exactly what the listener
 * matches on, instead of drifting from it.
 */
export const WIDGET_TOGGLE_LABEL = 'Cmd/Ctrl + Alt + T';
let installed = false;
let hostEl: HTMLElement | null = null;
/**
 * Set by press-and-hold on the button itself. Deliberately *not*
 * persisted, unlike the hotkey's choice: without a keyboard there is
 * no way to bring the button back, so a persisted touch-hide would be
 * a one-way door. Reloading the page restores it.
 */
let sessionHidden = false;

function isVisible(): boolean {
  try {
    return typeof window !== 'undefined'
      && window.localStorage?.getItem(VISIBLE_KEY) === '1';
  } catch {
    return false;
  }
}

function setVisible(visible: boolean): void {
  try {
    if (visible) window.localStorage?.setItem(VISIBLE_KEY, '1');
    else window.localStorage?.removeItem(VISIBLE_KEY);
  } catch {
    /* private-mode storage unavailable */
  }
}

function applyVisibility(): void {
  if (hostEl) hostEl.style.display = isVisible() && !sessionHidden ? '' : 'none';
}

/**
 * Bottom-right floating button. Hidden by default — host apps that
 * want it always-on should document the hotkey for their users, or
 * promote it onto a fixed UI element of their own. The hotkey-driven
 * model keeps the SDK out of the way until someone explicitly asks
 * for it, mirroring how the iOS/Android shake gesture works on those
 * platforms.
 *
 * Press Cmd/Ctrl + Alt + T to toggle visibility. The visible flag is
 * persisted in localStorage so the choice survives reloads. End users
 * learn the combo from the onboarding tile, which derives it from
 * WIDGET_TOGGLE_LABEL above; the console line at install time is for
 * the developer integrating the SDK.
 *
 * Press and hold the button to tuck it out of the way for the rest of
 * the page session — the touch equivalent of the hotkey, since a combo
 * needs a keyboard. That hide is session-only on purpose (see
 * `sessionHidden`).
 */
export function installFloatingWidget(onTrigger: () => void): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;

  // eslint-disable-next-line no-console
  console.info('[Issuetracker] Bug button hidden. Press Cmd/Ctrl+Alt+T to show.');

  const mount = () => {
    if (document.getElementById(HOST_ID)) return;
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.lang = 'en'; // SDK copy is English regardless of host page language
    Object.assign(host.style, {
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      zIndex: '2147483646',
    });
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        /* Deliberately px-sized: icon-only 48px circle (no text to scale
           for WCAG 1.4.4); the "!" glyph is decorative within it. */
        button {
          all: unset;
          width: 48px; height: 48px; border-radius: 50%;
          background: #1f2937; color: white;
          display: grid; place-items: center;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
          font: 600 18px/1 system-ui, sans-serif;
        }
        /* "all: unset" strips the UA focus ring — restore it. */
        button:focus-visible { outline: 2px solid #1577AD; outline-offset: 2px; }
        @media (prefers-reduced-motion: no-preference) {
          button { transition: transform 120ms ease; }
          button:hover { transform: scale(1.05); }
          button:active { transform: scale(0.97); }
        }
      </style>
      <button title="Report a bug — hold to hide, ${WIDGET_TOGGLE_LABEL} to toggle" aria-label="Report a bug">!</button>
    `;
    const btn = shadow.querySelector('button');

    // Press-and-hold hides for the session. The click that follows the
    // hold has to be swallowed, or letting go would file a report.
    let holdTimer: number | undefined;
    let suppressClick = false;
    const clearHold = (): void => {
      if (holdTimer !== undefined) {
        clearTimeout(holdTimer);
        holdTimer = undefined;
      }
    };
    btn?.addEventListener('pointerdown', () => {
      clearHold();
      holdTimer = window.setTimeout(() => {
        holdTimer = undefined;
        suppressClick = true;
        sessionHidden = true;
        applyVisibility();
        // eslint-disable-next-line no-console
        console.info(
          `[Issuetracker] Bug button hidden for this page. Press ${WIDGET_TOGGLE_LABEL} or reload to show.`,
        );
      }, HIDE_HOLD_MS);
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      btn?.addEventListener(ev, clearHold);
    }
    // Long-press on touch otherwise raises the platform context menu
    // over the button we're trying to hide.
    btn?.addEventListener('contextmenu', (e) => e.preventDefault());
    btn?.addEventListener('click', (e) => {
      if (suppressClick) {
        suppressClick = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      onTrigger();
    });
    document.body.appendChild(host);
    hostEl = host;
    applyVisibility();
  };

  const onKeydown = (e: KeyboardEvent) => {
    // Cmd/Ctrl + Alt + T — modifiers chosen to avoid common browser
    // shortcuts (Cmd+Shift+T reopens tabs, Cmd+Shift+I opens devtools).
    // Layout-independent via e.code so non-QWERTY keyboards still hit
    // the same physical key.
    if ((e.metaKey || e.ctrlKey) && e.altKey && e.code === 'KeyT') {
      e.preventDefault();
      // Toggle against what is actually on screen, not just the stored
      // flag. After a press-and-hold the flag still reads 'visible', so
      // toggling on the flag alone would hide an already-hidden button
      // and strand the user — the one-way door this hotkey exists to
      // prevent. Either way the press states a durable intent, so the
      // session hide is cleared.
      const next = !(isVisible() && !sessionHidden);
      setVisible(next);
      sessionHidden = false;
      applyVisibility();
      if (!next) {
        // eslint-disable-next-line no-console
        console.info('[Issuetracker] Bug button hidden. Press Cmd/Ctrl+Alt+T to show.');
      }
    }
  };
  document.addEventListener('keydown', onKeydown);

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
}
