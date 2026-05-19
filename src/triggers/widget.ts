const HOST_ID = 'issuetracker-floating-widget';
const VISIBLE_KEY = 'io.issuetracker.sdk.widget.visible';
let installed = false;
let hostEl: HTMLElement | null = null;

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
  if (hostEl) hostEl.style.display = isVisible() ? '' : 'none';
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
 * persisted in localStorage so the choice survives reloads. Console
 * logs the shortcut once at install-time so devs integrating the SDK
 * see how to bring the button up; end users learn it from the host
 * app's docs.
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
    Object.assign(host.style, {
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      zIndex: '2147483646',
    });
    const shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `
      <style>
        button {
          all: unset;
          width: 48px; height: 48px; border-radius: 50%;
          background: #1f2937; color: white;
          display: grid; place-items: center;
          cursor: pointer;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
          transition: transform 120ms ease;
          font: 600 18px/1 system-ui, sans-serif;
        }
        button:hover { transform: scale(1.05); }
        button:active { transform: scale(0.97); }
      </style>
      <button title="Report a bug (Cmd/Ctrl+Alt+T to toggle)" aria-label="Report a bug">!</button>
    `;
    const btn = shadow.querySelector('button');
    btn?.addEventListener('click', onTrigger);
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
      const next = !isVisible();
      setVisible(next);
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
