/**
 * Light/dark theming for every piece of SDK UI (reporter, editor,
 * terminated view, onboarding popover, floating button).
 *
 * Each SDK surface lives in a closed shadow root whose stylesheet
 * keys its colors off custom properties: light values on `:host`,
 * dark overrides on `:host([data-theme="dark"])`. This module owns
 * the one piece of state that switches them — the `data-theme`
 * attribute on each shadow host — and keeps it in sync with the host
 * page while any SDK surface is mounted.
 *
 * `configure({ theme })` picks the mode:
 * - `'light'` / `'dark'`: fixed.
 * - `'auto'` (default): follow the host page, see {@link readHostSignal}
 *   for the order, falling back to the OS `prefers-color-scheme`.
 */

export type ThemeSetting = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const ROOT_ATTRIBUTES = ['data-theme', 'data-bs-theme', 'data-color-scheme', 'data-mode'];
const DARK_QUERY = '(prefers-color-scheme: dark)';

let setting: ThemeSetting = 'auto';
const hosts = new Set<HTMLElement>();
let stopWatching: (() => void) | null = null;

export function normalizeThemeSetting(value: unknown): ThemeSetting {
  return value === 'light' || value === 'dark' ? value : 'auto';
}

/** Called from configure(); re-themes any surface already on screen. */
export function setThemeSetting(next: ThemeSetting): void {
  setting = normalizeThemeSetting(next);
  applyAll();
}

export function getThemeSetting(): ThemeSetting {
  return setting;
}

function asMode(value: string | null | undefined): ResolvedTheme | null {
  const v = value?.trim().toLowerCase();
  return v === 'dark' || v === 'light' ? v : null;
}

/**
 * Reads an explicit dark/light choice the host page has made on
 * `<html>`, or `null` when it hasn't made one. In order:
 * 1. A theme attribute: `data-theme`, `data-bs-theme` (Bootstrap),
 *    `data-color-scheme`, `data-mode` — value `dark` or `light`.
 * 2. A `dark` / `light` class (Tailwind's `darkMode: 'class'` and
 *    most hand-rolled toggles).
 * 3. The computed `color-scheme` on `<html>`, when it names exactly one
 *    of the two (`dark`, `only light`, ...). `light dark` or `normal`
 *    means "either", which is not a choice.
 */
export function readHostSignal(doc: Document = document): ResolvedTheme | null {
  const root = doc.documentElement;
  if (!root) return null;
  for (const name of ROOT_ATTRIBUTES) {
    const mode = asMode(root.getAttribute(name));
    if (mode) return mode;
  }
  const classes = (root.getAttribute('class') ?? '').split(/\s+/);
  const dark = classes.includes('dark');
  const light = classes.includes('light');
  if (dark !== light) return dark ? 'dark' : 'light';

  let scheme = '';
  try {
    const view = doc.defaultView;
    scheme = (view?.getComputedStyle(root).colorScheme ?? '') || root.style.colorScheme || '';
  } catch {
    scheme = '';
  }
  const words = scheme.toLowerCase().split(/\s+/).filter((w) => w && w !== 'only');
  const hasDark = words.includes('dark');
  const hasLight = words.includes('light');
  if (hasDark !== hasLight) return hasDark ? 'dark' : 'light';
  return null;
}

function prefersDark(win: Window | undefined): boolean {
  try {
    return Boolean(win?.matchMedia?.(DARK_QUERY).matches);
  } catch {
    return false;
  }
}

/** The mode SDK UI should render in right now. */
export function resolveTheme(
  current: ThemeSetting = setting,
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
): ResolvedTheme {
  if (current !== 'auto') return current;
  if (!doc) return 'light';
  return readHostSignal(doc) ?? (prefersDark(doc.defaultView ?? undefined) ? 'dark' : 'light');
}

function applyAll(): void {
  if (hosts.size === 0) return;
  const theme = resolveTheme();
  for (const host of hosts) {
    if (host.getAttribute('data-theme') !== theme) host.setAttribute('data-theme', theme);
  }
}

function startWatching(): () => void {
  const cleanups: Array<() => void> = [];
  const win = typeof window === 'undefined' ? undefined : window;
  try {
    const mql = win?.matchMedia?.(DARK_QUERY);
    if (mql) {
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', applyAll);
        cleanups.push(() => mql.removeEventListener('change', applyAll));
      } else if (typeof mql.addListener === 'function') {
        // Safari < 14.
        mql.addListener(applyAll);
        cleanups.push(() => mql.removeListener(applyAll));
      }
    }
  } catch {
    /* no matchMedia: OS preference simply isn't tracked live */
  }
  if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
    // `class` and `style` cover class toggles and inline color-scheme;
    // a stylesheet swap that changes color-scheme without touching
    // <html> isn't observable here and is picked up on next open.
    const observer = new MutationObserver(applyAll);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [...ROOT_ATTRIBUTES, 'class', 'style'],
    });
    cleanups.push(() => observer.disconnect());
  }
  return () => cleanups.forEach((fn) => fn());
}

/**
 * Themes a shadow host now and keeps it themed until the returned
 * function is called. The page listeners are shared and only exist
 * while at least one host is bound.
 */
export function bindTheme(host: HTMLElement): () => void {
  hosts.add(host);
  host.setAttribute('data-theme', resolveTheme());
  if (!stopWatching) stopWatching = startWatching();
  let bound = true;
  return () => {
    if (!bound) return;
    bound = false;
    hosts.delete(host);
    if (hosts.size === 0 && stopWatching) {
      stopWatching();
      stopWatching = null;
    }
  };
}

/** Test hook: whether page listeners are currently installed. */
export function isWatchingForTest(): boolean {
  return stopWatching !== null;
}
