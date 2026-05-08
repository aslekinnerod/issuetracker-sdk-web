const HOST_ID = 'issuetracker-floating-widget';
let installed = false;

/**
 * Bottom-right floating button. Always-visible fallback trigger so
 * users on environments where shake/shortcut don't work still have a
 * way in. Rendered in a closed shadow root so host-page CSS can't
 * bleed in.
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
      <button title="Report a bug" aria-label="Report a bug">!</button>
    `;
    const btn = shadow.querySelector('button');
    btn?.addEventListener('click', onTrigger);
    document.body.appendChild(host);
  };

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
}
