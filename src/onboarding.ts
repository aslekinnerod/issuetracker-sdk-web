import shakeImage from './ui/onboarding/shake.webp';
import longpressImage from './ui/onboarding/longpress.webp';
import { manageModalFocus } from './ui/focus';
import { describeShortcut, shortcutGlyphs } from './triggers/shortcut';
import type { ShortcutConfig } from './runtime';

// Persistence — same pattern as identity.ts, falls back to in-memory
// when localStorage is unavailable (Safari private mode, sandboxed
// iframes). In those environments the popover will render on every
// page load until reload, which is acceptable.
const SHOWN_KEY = 'io.issuetracker.sdk.onboarding.shown';
let memoryShown = false;

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !('localStorage' in window)) return null;
    window.localStorage.setItem('__it_probe', '1');
    window.localStorage.removeItem('__it_probe');
    return window.localStorage;
  } catch {
    return null;
  }
}

function hasBeenShown(): boolean {
  const ls = safeStorage();
  if (ls) return ls.getItem(SHOWN_KEY) === '1';
  return memoryShown;
}

function markShown(): void {
  const ls = safeStorage();
  if (ls) ls.setItem(SHOWN_KEY, '1');
  else memoryShown = true;
}

// State for the currently mounted popover (if any), so a double-
// trigger from the host app can't stack two popovers on top of each
// other.
let active = false;

interface PresentArgs {
  shakeEnabled: boolean;
  longPressEnabled: boolean;
  /**
   * The *effective* shortcut combo (default or host-configured), or
   * `false` when the shortcut is disabled — the tile renders whatever
   * combo the keydown listener actually matches on, so display and
   * behaviour can't drift apart.
   */
  shortcut: Required<ShortcutConfig> | false;
  enableFloatingWidget: boolean;
}

// Configure-time entry point — silently no-ops on second launch
// (or on first launch with no enabled gestures).
export function presentOnboardingIfNeeded(args: PresentArgs): void {
  if (hasBeenShown()) return;
  present(args, /*markAfter*/ true);
}

// Public Issuetracker.showOnboarding() entry — bypasses the persisted
// "already-shown" flag but still respects the no-tiles-to-render
// no-op (programmatic-only integrators don't get an empty popover).
export function presentOnboardingForced(args: PresentArgs): void {
  present(args, /*markAfter*/ false);
}

function present(args: PresentArgs, markAfter: boolean): void {
  if (typeof document === 'undefined') return;
  if (active) return;

  const tiles = buildTiles(args);
  if (tiles.length === 0) {
    // No triggers enabled means there's nothing to teach. Still
    // record "shown" in the configure-time path so flipping a trigger
    // on later doesn't surprise the user with an out-of-context popover.
    if (markAfter) markShown();
    return;
  }
  active = true;

  const host = document.createElement('div');
  host.id = 'it-onboarding-host';
  host.lang = 'en'; // SDK copy is English regardless of host page language
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646', // one below the reporter so a long-press
                          // mid-onboarding doesn't render under it
  });
  const shadow = host.attachShadow({ mode: 'closed' });
  document.body.appendChild(host);

  // Trap focus in the dialog, inert the host page, restore focus on
  // teardown.
  const focus = manageModalFocus(host, shadow);

  const teardown = () => {
    host.remove();
    focus.release();
    active = false;
  };

  shadow.innerHTML = `
    <style>${STYLES}</style>
    <div class="overlay">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="it-onb-title">
        <div class="header">
          <div class="brand-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" width="24" height="24">
              <path d="M12 2L4 6v6c0 5.5 3.84 10.74 8 12 4.16-1.26 8-6.5 8-12V6l-8-4z"/>
              <path d="M9 12l2 2 4-4"/>
            </svg>
          </div>
          <div>
            <h2 id="it-onb-title">Report bugs from anywhere</h2>
            <p class="subtitle">${tiles.length === 1 ? 'One quick gesture is all it takes' : 'Two quick gestures, your choice'}</p>
          </div>
        </div>
        <div class="tiles">
          ${tiles.map(renderTile).join('')}
        </div>
        <button id="it-onb-dismiss" class="primary">Got it</button>
      </div>
    </div>
  `;
  const dismiss = () => {
    if (markAfter) markShown();
    teardown();
  };
  const dismissBtn = shadow.getElementById('it-onb-dismiss') as HTMLButtonElement | null;
  dismissBtn?.addEventListener('click', dismiss);
  // Escape dismisses the same way "Got it" does.
  focus.setEscapeHandler(dismiss);
  // Move focus into the dialog on open.
  setTimeout(() => dismissBtn?.focus(), 0);
}

interface Tile {
  title: string;
  caption: string;
  // Either a data URL for a raster image (shake / long-press), or an
  // inline SVG markup string (shortcut / widget) — rendered as <img>
  // or directly into the illustration div respectively.
  image?: string;
  inlineSvg?: string;
}

function buildTiles(args: PresentArgs): Tile[] {
  const tiles: Tile[] = [];
  if (args.shakeEnabled) {
    tiles.push({
      title: 'Shake your phone',
      caption: 'Shake to open the reporter.',
      image: shakeImage,
    });
  }
  if (args.longPressEnabled) {
    tiles.push({
      title: 'Two-finger press',
      caption: 'Hold with two fingers for 3 seconds.',
      image: longpressImage,
    });
  }
  if (args.shortcut) {
    // Caption and glyph are derived from the effective config so a
    // host-remapped combo (or a future default change) shows up here
    // automatically instead of drifting from the real listener.
    const glyphs = escapeHtml(shortcutGlyphs(args.shortcut));
    tiles.push({
      title: 'Keyboard shortcut',
      caption: `${describeShortcut(args.shortcut)}.`,
      // SVG glyph for the keyboard shortcut — designed inline because
      // we don't have a dedicated illustration. Reads cleanly at tile
      // size and keeps the bundle small. Font size steps down for
      // longer combos (e.g. with Shift) so the label stays inside the
      // keycap rect.
      inlineSvg: `<svg aria-hidden="true" focusable="false" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="20" width="80" height="60" rx="8" fill="#EAF0F6" stroke="#1FA2E8" stroke-width="2"/><text x="50" y="57" text-anchor="middle" font-family="-apple-system, Helvetica, sans-serif" font-size="${glyphs.length > 3 ? 18 : 22}" font-weight="600" fill="#1FA2E8">${glyphs}</text></svg>`,
    });
  }
  if (args.enableFloatingWidget) {
    tiles.push({
      title: 'Floating button',
      caption: 'Tap the corner button anytime.',
      inlineSvg: '<svg aria-hidden="true" focusable="false" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="75" cy="75" r="20" fill="#1FA2E8"/><circle cx="75" cy="75" r="20" fill="none" stroke="#0D7C8A" stroke-width="2" stroke-dasharray="4 4" opacity="0.5"/></svg>',
    });
  }
  return tiles;
}

function renderTile(t: Tile): string {
  const illustration = t.image
    ? `<img src="${t.image}" alt="" />`
    : (t.inlineSvg ?? '');
  return `
    <div class="tile">
      <div class="illustration">${illustration}</div>
      <div class="tile-body">
        <div class="tile-title">${escapeHtml(t.title)}</div>
        <div class="tile-caption">${escapeHtml(t.caption)}</div>
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STYLES = `
  /* 1rem pierces the shadow boundary and tracks the user's browser
     default font size (WCAG 1.4.4); all inner sizes are em off this base. */
  :host { all: initial; font-size: 1rem; }
  .overlay {
    position: fixed; inset: 0;
    background: rgba(14, 26, 43, 0.55);
    display: flex; align-items: center; justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  @media (prefers-reduced-motion: no-preference) {
    .overlay { animation: it-fadein 160ms ease-out; }
  }
  @keyframes it-fadein { from { opacity: 0 } to { opacity: 1 } }
  button:focus-visible { outline: 2px solid #1577AD; outline-offset: 2px; }
  .sheet {
    background: #F4F7FA;
    border-radius: 12px;
    max-width: 480px;
    width: calc(100% - 32px);
    max-height: calc(100vh - 64px);
    overflow-y: auto;
    padding: 32px 24px 24px;
    box-shadow: 0 10px 40px rgba(14, 26, 43, 0.25);
  }
  .header { display: flex; gap: 12px; align-items: center; margin-bottom: 24px; }
  .brand-icon { color: #1FA2E8; flex-shrink: 0; }
  h2 {
    margin: 0; font-size: 1em; font-weight: 600;
    color: #0E1A2B; letter-spacing: -0.3px;
  }
  .subtitle {
    margin: 2px 0 0; font-size: 0.75em; color: #5B6B80;
  }
  .tiles { display: flex; flex-direction: column; gap: 16px; margin-bottom: 32px; }
  .tile {
    display: flex; gap: 16px; align-items: center;
    background: #FFFFFF;
    border: 1px solid #DCE4ED;
    border-radius: 8px;
    padding: 12px;
  }
  .illustration {
    width: 88px; height: 88px;
    background: #EAF0F6;
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    padding: 12px;
    box-sizing: border-box;
  }
  .illustration svg,
  .illustration img { width: 100%; height: 100%; display: block; object-fit: contain; }
  .tile-body { flex: 1; min-width: 0; }
  .tile-title {
    font-size: 0.9375em; font-weight: 600; color: #0E1A2B;
    margin-bottom: 2px;
  }
  .tile-caption { font-size: 0.8125em; color: #43536B; }
  .primary {
    width: 100%; min-height: 44px;
    background: #1577AD; color: #FFFFFF;
    border: none; border-radius: 4px;
    font-size: 0.875em; font-weight: 500;
    cursor: pointer; letter-spacing: -0.1px;
  }
  .primary:hover { background: #116591; }
  .primary:active { transform: translateY(1px); }
`;
