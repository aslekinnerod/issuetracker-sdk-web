import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// widget.ts installs once per module instance (`installed` guard) and
// binds a document-level keydown listener, so each test loads a fresh
// module and unbinds what that instance added. Without the unbind, the
// leaked listeners from earlier tests would each flip the persisted
// flag on a single toggle press.

const HOST_ID = 'issuetracker-floating-widget';
const VISIBLE_KEY = 'io.issuetracker.sdk.widget.visible';

function host(): HTMLElement | null {
  return document.getElementById(HOST_ID);
}
function hidden(): boolean {
  return host()?.style.display === 'none';
}
function pressToggle(): void {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'KeyT', ctrlKey: true, altKey: true, bubbles: true }),
  );
}

const realAttach = Element.prototype.attachShadow;
const realDocAdd = document.addEventListener.bind(document);
let added: Array<[string, EventListenerOrEventListenerObject]> = [];

beforeEach(() => {
  localStorage.clear();
  host()?.remove();
  added = [];
  // The production call asks for a closed root, which a test can't
  // query. Force it open so the button is reachable; nothing else
  // about the widget's behaviour depends on the mode.
  Element.prototype.attachShadow = function attach(this: Element, init: ShadowRootInit) {
    return realAttach.call(this, { ...init, mode: 'open' });
  } as typeof Element.prototype.attachShadow;
  document.addEventListener = ((
    type: string,
    fn: EventListenerOrEventListenerObject,
    opts?: boolean | AddEventListenerOptions,
  ) => {
    added.push([type, fn]);
    realDocAdd(type, fn, opts);
  }) as typeof document.addEventListener;
});

afterEach(() => {
  for (const [type, fn] of added) document.removeEventListener(type, fn);
  Element.prototype.attachShadow = realAttach;
  document.addEventListener = realDocAdd;
  host()?.remove();
  vi.useRealTimers();
});

async function install(onTrigger: () => void = () => {}): Promise<HTMLElement> {
  vi.resetModules();
  const mod = await import('./widget');
  mod.installFloatingWidget(onTrigger);
  const btn = host()?.shadowRoot?.querySelector('button');
  if (!btn) throw new Error('widget button not mounted');
  return btn as HTMLElement;
}

const down = (b: HTMLElement) => b.dispatchEvent(new Event('pointerdown', { bubbles: true }));
const up = (b: HTMLElement) => b.dispatchEvent(new Event('pointerup', { bubbles: true }));
const click = (b: HTMLElement) =>
  b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

describe('floating widget', () => {
  it('starts hidden and the hotkey toggles it, persisting the choice', async () => {
    await install();
    expect(host()).not.toBeNull();
    expect(hidden()).toBe(true);

    pressToggle();
    expect(hidden()).toBe(false);
    expect(localStorage.getItem(VISIBLE_KEY)).toBe('1');

    pressToggle();
    expect(hidden()).toBe(true);
    expect(localStorage.getItem(VISIBLE_KEY)).toBeNull();
  });

  it('press-and-hold hides it without filing a report', async () => {
    vi.useFakeTimers();
    const onTrigger = vi.fn();
    const btn = await install(onTrigger);
    pressToggle();
    expect(hidden()).toBe(false);

    down(btn);
    vi.advanceTimersByTime(700);
    expect(hidden()).toBe(true);

    // Releasing after a hold must not open the reporter.
    click(btn);
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it('a short tap still reports', async () => {
    vi.useFakeTimers();
    const onTrigger = vi.fn();
    const btn = await install(onTrigger);
    pressToggle();

    down(btn);
    vi.advanceTimersByTime(100);
    up(btn);
    click(btn);
    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(hidden()).toBe(false);
  });

  it('the hotkey brings back a held-away button — no one-way door', async () => {
    vi.useFakeTimers();
    const btn = await install();
    pressToggle();
    down(btn);
    vi.advanceTimersByTime(700);
    expect(hidden()).toBe(true);
    // The hold is session-only, so the persisted flag still says
    // "visible" and the next press must show rather than re-hide.
    expect(localStorage.getItem(VISIBLE_KEY)).toBe('1');

    pressToggle();
    expect(hidden()).toBe(false);
  });

  it('quotes the same combo the listener matches on', async () => {
    vi.resetModules();
    const mod = await import('./widget');
    expect(mod.WIDGET_TOGGLE_LABEL).toBe('Cmd/Ctrl + Alt + T');
  });
});
