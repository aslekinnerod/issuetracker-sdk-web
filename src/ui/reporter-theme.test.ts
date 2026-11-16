import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// End-to-end through the public facade: configure({ theme }) reaches
// the reporter's and the floating button's shadow hosts, `auto` follows
// <html> live while the dialog is open, and closing the dialog drops
// the page listeners.

vi.mock('html2canvas-pro', () => ({
  default: vi.fn(async () => ({ toDataURL: () => 'data:image/jpeg;base64,SHOT' })),
}));

const REPORTER_HOST_ID = 'issuetracker-reporter';
const WIDGET_HOST_ID = 'issuetracker-floating-widget';

const realAttach = Element.prototype.attachShadow;
const realDocAdd = document.addEventListener.bind(document);
const realWinAdd = window.addEventListener.bind(window);
let listeners: Array<['w' | 'd', string, EventListenerOrEventListenerObject]> = [];

const tick = async (rounds = 8) => {
  for (let i = 0; i < rounds; i += 1) await new Promise((r) => setTimeout(r, 0));
};

const reporterHost = () => document.getElementById(REPORTER_HOST_ID);

beforeEach(() => {
  localStorage.clear();
  listeners = [];
  document.documentElement.removeAttribute('data-theme');
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (q: string) =>
      ({
        matches: false,
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ result: { requireTesterAttestation: false } }))),
  );
  // Closed roots can't be queried from a test (same trick as widget.test.ts).
  Element.prototype.attachShadow = function attach(this: Element, init: ShadowRootInit) {
    return realAttach.call(this, { ...init, mode: 'open' });
  } as typeof Element.prototype.attachShadow;
  // configure() binds window/document listeners that outlive
  // vi.resetModules(); record and unbind them after each test.
  window.addEventListener = ((t: string, fn: EventListenerOrEventListenerObject, o?: never) => {
    listeners.push(['w', t, fn]);
    realWinAdd(t, fn, o);
  }) as typeof window.addEventListener;
  document.addEventListener = ((t: string, fn: EventListenerOrEventListenerObject, o?: never) => {
    listeners.push(['d', t, fn]);
    realDocAdd(t, fn, o);
  }) as typeof document.addEventListener;
});

afterEach(() => {
  for (const [target, type, fn] of listeners) {
    if (target === 'w') window.removeEventListener(type, fn);
    else document.removeEventListener(type, fn);
  }
  window.addEventListener = realWinAdd as typeof window.addEventListener;
  document.addEventListener = realDocAdd as typeof document.addEventListener;
  Element.prototype.attachShadow = realAttach;
  reporterHost()?.remove();
  document.getElementById(WIDGET_HOST_ID)?.remove();
  document.documentElement.removeAttribute('data-theme');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openWith(theme?: 'auto' | 'light' | 'dark') {
  vi.resetModules();
  const { Issuetracker } = await import('../index');
  const themeMod = await import('./theme');
  Issuetracker.identify('Tester'); // skip the name prompt
  Issuetracker.configure({
    apiKey: 'it_dev_themetest',
    enableCrashReporting: false,
    longPressToReport: false,
    showFloatingWidget: false,
    ...(theme ? { theme } : {}),
  });
  Issuetracker.report();
  await tick();
  const host = reporterHost();
  if (!host?.shadowRoot) throw new Error('reporter not mounted');
  return { host, shadow: host.shadowRoot, themeMod, Issuetracker };
}

describe('reporter theme', () => {
  it('renders dark when configured dark, even on a light page', async () => {
    document.documentElement.setAttribute('data-theme', 'light');
    const { host, shadow } = await openWith('dark');
    expect(host.getAttribute('data-theme')).toBe('dark');
    // The stylesheet the host attribute switches is in the shadow root.
    expect(shadow.querySelector('style')?.textContent).toContain(':host([data-theme="dark"])');
  });

  it('defaults to auto and follows <html data-theme> live while open', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const { host } = await openWith();
    expect(host.getAttribute('data-theme')).toBe('dark');
    document.documentElement.setAttribute('data-theme', 'light');
    await tick(1);
    expect(host.getAttribute('data-theme')).toBe('light');
  });

  it('closing the dialog removes the page listeners', async () => {
    const { shadow, themeMod } = await openWith();
    expect(themeMod.isWatchingForTest()).toBe(true);
    (shadow.getElementById('cancel') as HTMLButtonElement).click();
    expect(reporterHost()).toBeNull();
    expect(themeMod.isWatchingForTest()).toBe(false);
  });

  it('themes the floating button too', async () => {
    vi.resetModules();
    const { Issuetracker } = await import('../index');
    Issuetracker.configure({
      apiKey: 'it_dev_themetest',
      enableCrashReporting: false,
      longPressToReport: false,
      showFloatingWidget: true,
      theme: 'dark',
    });
    expect(document.getElementById(WIDGET_HOST_ID)?.getAttribute('data-theme')).toBe('dark');
  });
});
