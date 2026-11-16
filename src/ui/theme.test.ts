import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// theme.ts keeps module state (the configured setting, the bound hosts
// and the shared page listeners), so each test loads a fresh module.

type ThemeModule = typeof import('./theme');

interface FakeMql {
  matches: boolean;
  listeners: Set<() => void>;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
}

let mql: FakeMql;

function mockPrefersDark(matches: boolean): void {
  mql = {
    matches,
    listeners: new Set(),
    addEventListener: (_t, fn) => mql.listeners.add(fn),
    removeEventListener: (_t, fn) => mql.listeners.delete(fn),
  };
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q: string) => ({ ...mql, media: q }) as unknown as MediaQueryList,
  );
}

function flipOs(matches: boolean): void {
  mql.matches = matches;
  mql.listeners.forEach((fn) => fn());
}

/** MutationObserver callbacks are microtasks. */
const flush = () => new Promise((r) => setTimeout(r, 0));

async function load(): Promise<ThemeModule> {
  vi.resetModules();
  return import('./theme');
}

function resetRoot(): void {
  const root = document.documentElement;
  // happy-dom's cached classList/style can outlive removeAttribute;
  // clear them through the live objects first.
  root.classList.remove('dark', 'light', 'app');
  root.style.cssText = '';
  for (const a of ['data-theme', 'data-bs-theme', 'data-color-scheme', 'data-mode', 'class', 'style']) {
    root.removeAttribute(a);
  }
}

beforeEach(() => {
  resetRoot();
  mockPrefersDark(false);
});

afterEach(() => {
  resetRoot();
  vi.restoreAllMocks();
});

describe('resolveTheme', () => {
  it('explicit light/dark ignore the page and the OS', async () => {
    const { resolveTheme } = await load();
    document.documentElement.setAttribute('data-theme', 'dark');
    expect(resolveTheme('light')).toBe('light');
    mockPrefersDark(false);
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('auto falls back to prefers-color-scheme when the page says nothing', async () => {
    const { resolveTheme } = await load();
    expect(resolveTheme('auto')).toBe('light');
    mockPrefersDark(true);
    expect(resolveTheme('auto')).toBe('dark');
  });

  it.each([
    ['data-theme', 'dark'],
    ['data-theme', 'light'],
    ['data-bs-theme', 'dark'],
    ['data-color-scheme', 'light'],
    ['data-mode', 'dark'],
  ])('auto reads %s="%s" on <html> over the OS', async (attr, value) => {
    const { resolveTheme } = await load();
    mockPrefersDark(value === 'light');
    document.documentElement.setAttribute(attr, value);
    expect(resolveTheme('auto')).toBe(value);
  });

  it('auto reads a dark/light class on <html>', async () => {
    const { resolveTheme } = await load();
    document.documentElement.className = 'app dark';
    expect(resolveTheme('auto')).toBe('dark');
    mockPrefersDark(true);
    document.documentElement.className = 'light';
    expect(resolveTheme('auto')).toBe('light');
  });

  it('ignores unrelated data-theme values and falls through', async () => {
    const { resolveTheme } = await load();
    mockPrefersDark(true);
    document.documentElement.setAttribute('data-theme', 'ocean');
    expect(resolveTheme('auto')).toBe('dark');
  });

  it('auto reads a single-valued color-scheme on <html>, but not "light dark"', async () => {
    const { resolveTheme } = await load();
    document.documentElement.style.setProperty('color-scheme', 'dark');
    expect(resolveTheme('auto')).toBe('dark');
    mockPrefersDark(true);
    document.documentElement.style.setProperty('color-scheme', 'only light');
    expect(resolveTheme('auto')).toBe('light');
    document.documentElement.style.setProperty('color-scheme', 'light dark');
    expect(resolveTheme('auto')).toBe('dark'); // OS decides
  });

  // The Issuetracker web app (apps/web/src/theme.ts + tokens.css): dark
  // is the default with no attribute but `color-scheme: dark` on :root;
  // light sets data-theme="light" (and color-scheme: light).
  it('follows the Issuetracker web app in both of its modes, whatever the OS says', async () => {
    const { resolveTheme } = await load();
    const root = document.documentElement;
    mockPrefersDark(false);
    root.style.setProperty('color-scheme', 'dark');
    expect(resolveTheme('auto')).toBe('dark');
    mockPrefersDark(true);
    root.setAttribute('data-theme', 'light');
    root.style.setProperty('color-scheme', 'light');
    expect(resolveTheme('auto')).toBe('light');
  });
});

describe('normalizeThemeSetting', () => {
  it('defaults anything unknown to auto', async () => {
    const { normalizeThemeSetting } = await load();
    expect(normalizeThemeSetting(undefined)).toBe('auto');
    expect(normalizeThemeSetting('Dark')).toBe('auto');
    expect(normalizeThemeSetting('dark')).toBe('dark');
    expect(normalizeThemeSetting('light')).toBe('light');
  });
});

describe('bindTheme', () => {
  it('stamps data-theme on the host and follows setThemeSetting', async () => {
    const t = await load();
    const host = document.createElement('div');
    const unbind = t.bindTheme(host);
    expect(host.getAttribute('data-theme')).toBe('light');
    t.setThemeSetting('dark');
    expect(host.getAttribute('data-theme')).toBe('dark');
    unbind();
  });

  it('updates live when the OS preference changes', async () => {
    const t = await load();
    const host = document.createElement('div');
    const unbind = t.bindTheme(host);
    expect(host.getAttribute('data-theme')).toBe('light');
    flipOs(true);
    expect(host.getAttribute('data-theme')).toBe('dark');
    unbind();
  });

  it('updates live when <html> attributes change', async () => {
    const t = await load();
    const host = document.createElement('div');
    const unbind = t.bindTheme(host);
    document.documentElement.setAttribute('data-theme', 'dark');
    await flush();
    expect(host.getAttribute('data-theme')).toBe('dark');
    document.documentElement.setAttribute('data-theme', 'light');
    await flush();
    expect(host.getAttribute('data-theme')).toBe('light');
    unbind();
  });

  it('a fixed theme does not move when the page or OS does', async () => {
    const t = await load();
    t.setThemeSetting('light');
    const host = document.createElement('div');
    const unbind = t.bindTheme(host);
    flipOs(true);
    document.documentElement.classList.add('dark');
    await flush();
    expect(host.getAttribute('data-theme')).toBe('light');
    unbind();
  });

  it('removes page listeners once the last host is unbound', async () => {
    const t = await load();
    const a = document.createElement('div');
    const b = document.createElement('div');
    const unbindA = t.bindTheme(a);
    const unbindB = t.bindTheme(b);
    expect(t.isWatchingForTest()).toBe(true);
    expect(mql.listeners.size).toBe(1);
    unbindA();
    unbindA(); // idempotent
    expect(t.isWatchingForTest()).toBe(true);
    unbindB();
    expect(t.isWatchingForTest()).toBe(false);
    expect(mql.listeners.size).toBe(0);

    // An unbound host is no longer updated.
    document.documentElement.setAttribute('data-theme', 'dark');
    await flush();
    expect(a.getAttribute('data-theme')).toBe('light');
  });
});
