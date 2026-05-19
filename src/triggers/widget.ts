const HOST_ID = 'issuetracker-floating-widget';
const HIDDEN_KEY = 'io.issuetracker.sdk.widget.hidden';
let installed = false;
let hostEl: HTMLElement | null = null;

function isHidden(): boolean {
  try {
    return typeof window !== 'undefined'
      && window.localStorage?.getItem(HIDDEN_KEY) === '1';
  } catch {
    return false;
  }
}

function setHidden(hidden: boolean): void {
  try {
    if (hidden) window.localStorage?.setItem(HIDDEN_KEY, '1');
    else window.localStorage?.removeItem(HIDDEN_KEY);
  } catch {
    /* private-mode storage unavailable */
  }
}

function applyVisibility(): void {
  if (hostEl) hostEl.style.display = isHidden() ? 'none' : '';
}

/**
 * Bottom-right floating button. Always-visible fallback trigger so
 * users on environments where shake/shortcut don't work still have a
 * way in. Rendered in a closed shadow root so host-page CSS can't
 * bleed in.
 *
 * Press Cmd/Ctrl + Alt + T to toggle visibility — useful when the
 * button overlaps real UI on a specific screen. The hidden flag is
 * persisted in localStorage so the choice survives reloads. Console
 * logs the shortcut on hide so users who forget it can find their way
 * back.
 */
export function installFloatingWidget(onTrigger: () => void): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;

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
      const next = !isHidden();
      setHidden(next);
      applyVisibility();
      if (next) {
        // eslint-disable-next-line no-console
        console.info('[Issuetracker] Bug button hidden. Press Cmd/Ctrl+Alt+T to show.');
      }
    }
  };
  document.addEventListener('keydown', onKeydown);

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
}
