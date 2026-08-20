import type { ShortcutConfig } from '../runtime';

let installed = false;
let handler: (() => void) | null = null;
// null = shortcut disabled (listener stays but never fires) — lets
// re-configure(enableShortcut: false) turn the shortcut off live.
let activeConfig: Required<ShortcutConfig> | null = defaultShortcut();

/**
 * Default: Cmd/Ctrl + Alt + R. Chosen over the previous
 * Cmd/Ctrl + Shift + B because Shift+B collides with the browser's
 * bookmarks-bar toggle — our preventDefault() was breaking that
 * browser feature on host pages. Alt combos are free of the common
 * browser-reserved shortcuts, and matching on `e.code` (the physical
 * key) keeps the combo layout-independent even where Alt+letter
 * produces dead keys or altered characters (e.g. macOS option-chars).
 */
export function defaultShortcut(): Required<ShortcutConfig> {
  return { code: 'KeyR', altKey: true, shiftKey: false };
}

/**
 * Normalises the configure() option into the effective shortcut:
 * `false` disables, `true`/`undefined` means the default combo, and a
 * descriptor overrides it. Exported so onboarding can derive the
 * combo it displays from the same source of truth the listener uses.
 */
export function resolveShortcutConfig(
  option: boolean | ShortcutConfig | undefined,
): Required<ShortcutConfig> | false {
  if (option === false) return false;
  if (option === true || option === undefined) return defaultShortcut();
  return {
    code: option.code,
    altKey: option.altKey ?? false,
    shiftKey: option.shiftKey ?? false,
  };
}

/** `KeyR` → `R`, `Digit1` → `1`; anything else displays as-is. */
function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return code;
}

/** Long form for captions/docs, e.g. "Cmd/Ctrl + Alt + R". */
export function describeShortcut(config: Required<ShortcutConfig>): string {
  const parts = ['Cmd/Ctrl'];
  if (config.altKey) parts.push('Alt');
  if (config.shiftKey) parts.push('Shift');
  parts.push(keyLabel(config.code));
  return parts.join(' + ');
}

/** Compact glyph form for the onboarding tile, e.g. "⌘⌥R". */
export function shortcutGlyphs(config: Required<ShortcutConfig>): string {
  let s = '⌘';
  if (config.altKey) s += '⌥';
  if (config.shiftKey) s += '⇧';
  return s + keyLabel(config.code);
}

/**
 * Cmd/Ctrl (+ Alt/Shift per config) + a physical key. Skipped when
 * focus is in a text input so we don't swallow normal typing.
 * Repeat calls update the handler and combo live (listener installs
 * once; both are read at fire time) — matches how re-configure works
 * for the other triggers.
 */
export function installShortcut(
  onTrigger: () => void,
  config: Required<ShortcutConfig> = defaultShortcut(),
): void {
  handler = onTrigger;
  activeConfig = config;
  addListenerIfNeeded();
}

/** Turn the shortcut off live (re-configure with enableShortcut: false). */
export function disableShortcut(): void {
  activeConfig = null;
}

function addListenerIfNeeded(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('keydown', (e) => {
    // Match on e.code (physical key) — layout-independent, and immune
    // to Alt+letter producing dead keys / altered characters in e.key.
    if (!activeConfig) return;
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.altKey !== activeConfig.altKey) return;
    if (e.shiftKey !== activeConfig.shiftKey) return;
    if (e.code !== activeConfig.code) return;
    // Skip when focus is in an editable field so we don't hijack a
    // shortcut aimed at the text control. composedPath() sees through
    // open shadow roots; e.target is the fallback.
    const target = (e.composedPath?.()[0] ?? e.target) as EventTarget | null;
    if (target instanceof HTMLElement) {
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
        return;
      }
    }
    // Only after the combo fully matches — a partial match must never
    // steal the browser's own shortcut.
    e.preventDefault();
    handler?.();
  });
}
