import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultShortcut,
  describeShortcut,
  installShortcut,
  resolveShortcutConfig,
  shortcutGlyphs,
} from './shortcut';

// shortcut.ts installs its window listener exactly once and reads the
// handler + combo at fire time, so repeat installShortcut() calls
// re-configure live. The tests below share that one listener (a fresh
// module per test would leak stale listeners onto the shared
// happy-dom window) and exercise the live-re-configure semantics the
// SDK actually relies on across configure() calls.

interface ComboInit {
  code: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

function press(init: ComboInit, target: EventTarget = window): KeyboardEvent {
  const e = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(e);
  return e;
}

describe('resolveShortcutConfig', () => {
  it('maps false to false (shortcut disabled)', () => {
    expect(resolveShortcutConfig(false)).toBe(false);
  });

  it('maps true and undefined to the default combo', () => {
    expect(resolveShortcutConfig(true)).toEqual(defaultShortcut());
    expect(resolveShortcutConfig(undefined)).toEqual(defaultShortcut());
  });

  it('defaults to Cmd/Ctrl + Alt + R', () => {
    expect(defaultShortcut()).toEqual({ code: 'KeyR', altKey: true, shiftKey: false });
  });

  it('fills unspecified modifiers on a descriptor with false', () => {
    expect(resolveShortcutConfig({ code: 'KeyB' })).toEqual({
      code: 'KeyB',
      altKey: false,
      shiftKey: false,
    });
    expect(resolveShortcutConfig({ code: 'KeyB', shiftKey: true })).toEqual({
      code: 'KeyB',
      altKey: false,
      shiftKey: true,
    });
  });
});

describe('shortcut display helpers', () => {
  it('describes the default combo', () => {
    expect(describeShortcut(defaultShortcut())).toBe('Cmd/Ctrl + Alt + R');
    expect(shortcutGlyphs(defaultShortcut())).toBe('⌘⌥R');
  });

  it('derives display from an arbitrary descriptor', () => {
    const combo = { code: 'Digit1', altKey: true, shiftKey: true };
    expect(describeShortcut(combo)).toBe('Cmd/Ctrl + Alt + Shift + 1');
    expect(shortcutGlyphs(combo)).toBe('⌘⌥⇧1');
  });
});

describe('installShortcut', () => {
  const onTrigger = vi.fn();

  beforeEach(() => {
    onTrigger.mockClear();
    // Reset to the default combo before every case — the listener is
    // shared, the config is live.
    installShortcut(onTrigger, defaultShortcut());
    document.body.innerHTML = '';
  });

  it('fires on Ctrl + Alt + R and prevents the browser default', () => {
    const e = press({ code: 'KeyR', ctrlKey: true, altKey: true });
    expect(onTrigger).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('fires on Meta + Alt + R (macOS)', () => {
    press({ code: 'KeyR', metaKey: true, altKey: true });
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('does not fire on the old Cmd/Ctrl + Shift + B combo', () => {
    const e = press({ code: 'KeyB', ctrlKey: true, shiftKey: true });
    expect(onTrigger).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it('does not preventDefault on a partial match', () => {
    // Missing Alt — must not steal the browser's own Ctrl+R (reload).
    const e = press({ code: 'KeyR', ctrlKey: true });
    expect(onTrigger).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it('requires the configured modifiers exactly (extra Shift rejected)', () => {
    const e = press({ code: 'KeyR', ctrlKey: true, altKey: true, shiftKey: true });
    expect(onTrigger).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it('matches on the physical key code, not the produced character', () => {
    // On layouts where Alt+R produces a dead key / altered character,
    // e.key differs but e.code is stable. key is deliberately bogus.
    const e = new KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: '®',
      code: 'KeyR',
      ctrlKey: true,
      altKey: true,
    });
    window.dispatchEvent(e);
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('is skipped while focus is in an editable field', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const e = press({ code: 'KeyR', ctrlKey: true, altKey: true }, input);
    expect(onTrigger).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it('re-configures the combo live on a repeat install', () => {
    const remapped = vi.fn();
    installShortcut(remapped, { code: 'KeyB', altKey: false, shiftKey: true });

    press({ code: 'KeyB', ctrlKey: true, shiftKey: true });
    expect(remapped).toHaveBeenCalledTimes(1);

    // The previous combo no longer matches anything.
    const e = press({ code: 'KeyR', ctrlKey: true, altKey: true });
    expect(onTrigger).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });
});
