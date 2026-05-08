let installed = false;
let handler: (() => void) | null = null;

/**
 * Cmd/Ctrl + Shift + B. Skipped when focus is in a text input so we
 * don't swallow normal typing. Also requires Shift to disambiguate
 * from accidental hits during normal browser shortcuts.
 */
export function installShortcut(onTrigger: () => void): void {
  handler = onTrigger;
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('keydown', (e) => {
    if (!e.shiftKey || !(e.metaKey || e.ctrlKey)) return;
    if (e.key.toLowerCase() !== 'b') return;
    e.preventDefault();
    handler?.();
  });
}
