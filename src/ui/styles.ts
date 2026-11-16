export const REPORTER_STYLES = `
  /* 1rem pierces the shadow boundary and tracks the user's browser
     default font size (WCAG 1.4.4); all inner sizes are em off this base. */
  :host { all: initial; font-size: 1rem; }
  /* Theme tokens. Light on :host, dark on :host([data-theme="dark"]);
     src/ui/theme.ts sets the attribute from configure({ theme }). Every
     text/UI pair is under WCAG AA regression in src/contrast.test.ts,
     in both themes. */
  :host {
    color-scheme: light;
    --it-overlay: rgba(0, 0, 0, 0.45);
    --it-shadow: rgba(0, 0, 0, 0.25);
    --it-sheet-bg: #ffffff;
    --it-text: #1f2937;
    --it-text-muted: #4b5563;
    --it-text-subtle: #6b7280;
    --it-divider: #e5e7eb;
    --it-hover: #f3f4f6;
    --it-input-bg: #ffffff;
    --it-input-text: #111827;
    --it-input-border: #8D949E;
    --it-input-focus: #2563eb;
    --it-focus-ring: #1577AD;
    --it-chip-text: #374151;
    --it-chip-selected-bg: #eff6ff;
    --it-chip-selected-border: #2563eb;
    --it-chip-selected-text: #1d4ed8;
    --it-link: #2563eb;
    --it-primary-bg: #2563eb;
    --it-primary-text: #ffffff;
    --it-disabled-bg: #9ca3af;
    --it-disabled-text: #ffffff;
    --it-error: #dc2626;
    --it-success: #15803d;
    --it-preview-bg: #f3f4f6;
    --it-editor-bg: #f3f4f6;
    --it-editor-text: #111827;
    --it-editor-disabled: #5f6672;
  }
  :host([data-theme="dark"]) {
    color-scheme: dark;
    --it-overlay: rgba(0, 0, 0, 0.6);
    --it-shadow: rgba(0, 0, 0, 0.5);
    --it-sheet-bg: #1b1e25;
    --it-text: #f0f2f5;
    --it-text-muted: #a7acb4;
    --it-text-subtle: #a7acb4;
    --it-divider: #2e323b;
    --it-hover: #21242c;
    --it-input-bg: #14161c;
    --it-input-text: #f0f2f5;
    --it-input-border: #898e98;
    --it-input-focus: #6aa8f7;
    --it-focus-ring: #85d6ff;
    --it-chip-text: #d4d7dc;
    --it-chip-selected-bg: #1e3047;
    --it-chip-selected-border: #6aa8f7;
    --it-chip-selected-text: #9cc8ff;
    --it-link: #6aa8f7;
    --it-primary-bg: #5b9df2;
    --it-primary-text: #14161c;
    --it-disabled-bg: #2e323b;
    --it-disabled-text: #a7acb4;
    --it-error: #f97f6a;
    --it-success: #5fc08f;
    --it-preview-bg: #14161c;
    --it-editor-bg: #111111;
    --it-editor-text: #ffffff;
    --it-editor-disabled: #8b919c;
  }
  * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  /* "all: unset" on the buttons below strips the UA focus ring — restore it. */
  button:focus-visible { outline: 2px solid var(--it-focus-ring); outline-offset: 2px; }
  .sr-only {
    position: absolute; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden;
    clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
  .overlay {
    position: fixed; inset: 0;
    background: var(--it-overlay);
    display: grid; place-items: center;
  }
  .sheet {
    background: var(--it-sheet-bg);
    width: min(560px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    border-radius: 12px;
    box-shadow: 0 10px 40px var(--it-shadow);
    display: flex; flex-direction: column;
    overflow: hidden;
    color: var(--it-text);
  }
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; border-bottom: 1px solid var(--it-divider);
  }
  .header h2 { margin: 0; font-size: 1em; font-weight: 600; }
  .close { all: unset; cursor: pointer; padding: 0.25em 0.625em; border-radius: 6px; color: var(--it-text-muted); }
  .close:hover { background: var(--it-hover); }
  .body { padding: 16px; overflow-y: auto; }
  label { font-size: 0.8125em; color: var(--it-text-muted); display: block; margin-bottom: 4px; }
  input[type=text], textarea {
    width: 100%; padding: 0.57143em 0.71429em; border: 1px solid var(--it-input-border);
    border-radius: 6px; font-size: 0.875em; color: var(--it-input-text); background: var(--it-input-bg);
  }
  textarea { resize: vertical; min-height: 80px; font-family: inherit; }
  input:focus, textarea:focus { outline: 2px solid var(--it-input-focus); outline-offset: -1px; border-color: transparent; }
  .types { display: flex; gap: 8px; margin-bottom: 12px; }
  .types button {
    all: unset; flex: 1; padding: 0.61538em; text-align: center;
    border: 1px solid var(--it-input-border); border-radius: 6px; cursor: pointer;
    font-size: 0.8125em; color: var(--it-chip-text);
  }
  .types button[aria-pressed="true"] { background: var(--it-chip-selected-bg); border-color: var(--it-chip-selected-border); color: var(--it-chip-selected-text); font-weight: 600; }
  /* Non-color cue for the selected type (1.4.1); aria-pressed carries it for AT. */
  .types button[aria-pressed="true"]::before { content: "✓ "; }
  .reporter-row {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 12px; font-size: 0.8125em; color: var(--it-text-muted);
  }
  .reporter-row button { all: unset; cursor: pointer; color: var(--it-link); padding: 0.46154em 0.61538em; }
  .screenshot-toggle {
    display: flex; align-items: center; gap: 8px; margin-top: 12px;
  }
  .screenshot-toggle label { margin: 0; flex: 1; }
  .screenshot-toggle .edit { all: unset; cursor: pointer; color: var(--it-link); padding: 0.46154em 0.61538em; font-size: 0.8125em; }
  .preview {
    margin-top: 8px;
    width: 100%; max-height: 240px;
    object-fit: contain;
    background: var(--it-preview-bg);
    border-radius: 6px;
  }
  .footer {
    display: flex; gap: 8px; justify-content: flex-end;
    padding: 12px 16px; border-top: 1px solid var(--it-divider);
  }
  .footer button {
    all: unset; cursor: pointer; padding: 0.57143em 1.14286em; border-radius: 6px;
    font-size: 0.875em; font-weight: 500;
  }
  .footer .secondary { color: var(--it-text-muted); }
  .footer .secondary:hover { background: var(--it-hover); }
  .footer .primary { background: var(--it-primary-bg); color: var(--it-primary-text); }
  .footer .primary[disabled] { background: var(--it-disabled-bg); color: var(--it-disabled-text); cursor: not-allowed; }
  .footer .primary[aria-disabled="true"] { background: var(--it-disabled-bg); color: var(--it-disabled-text); cursor: default; }
  .error { color: var(--it-error); font-size: 0.8125em; margin-top: 8px; }
  .status { color: var(--it-success); font-size: 0.8125em; margin-top: 8px; }
  .status:empty { display: none; }

  /* Name prompt */
  .name-prompt { padding: 24px; text-align: center; }
  .name-prompt h2 { font-size: 1.125em; margin: 0 0 8px; }
  .name-prompt p { color: var(--it-text-subtle); font-size: 0.8125em; margin: 0 0 16px; }
  .name-prompt-actions {
    display: flex; gap: 8px; justify-content: center; margin-top: 16px;
  }
  .name-prompt-actions button {
    padding: 0.57143em 1.14286em; border-radius: 6px; font-size: 0.875em; font-weight: 500;
    cursor: pointer; border: 1px solid var(--it-input-border); background: var(--it-sheet-bg); color: var(--it-text-muted);
  }
  .name-prompt-actions button.primary { background: var(--it-primary-bg); color: var(--it-primary-text); border-color: var(--it-primary-bg); }
  .name-prompt-actions button.primary[disabled] { background: var(--it-disabled-bg); color: var(--it-disabled-text); border-color: var(--it-disabled-bg); cursor: not-allowed; }

  /* Editor */
  .editor {
    position: fixed; inset: 0; background: var(--it-editor-bg);
    display: flex; flex-direction: column;
  }
  .editor .topbar {
    display: flex; justify-content: space-between; padding: 8px 12px;
  }
  .editor .topbar button {
    all: unset; cursor: pointer; color: var(--it-editor-text);
    padding: 0.57143em 0.85714em; font-size: 0.875em; font-weight: 500;
  }
  .editor .canvas-wrap {
    flex: 1; display: grid; place-items: center; padding: 8px; min-height: 0;
    /* Positioning context for the pending highlight-box overlay. */
    position: relative;
  }
  /* Pending "Add box" annotation (ISU-38): a focusable DOM overlay so it
     can be moved/resized with the keyboard before being committed to
     the bitmap (WCAG 2.5.7 / 2.1.1). Border color is set inline to the
     selected palette color. */
  .editor .hbox {
    position: absolute; box-sizing: border-box;
    border: 3px solid transparent;
    cursor: move; touch-action: none;
  }
  .editor .hbox:focus-visible { outline: 2px dashed var(--it-editor-text); outline-offset: 2px; }
  .editor canvas {
    max-width: 100%; max-height: 100%;
    touch-action: none; cursor: crosshair;
  }
  .editor .toolbar {
    display: flex; justify-content: space-evenly; align-items: center; padding: 12px;
  }
  .editor .swatch {
    all: unset; display: inline-block;
    width: 32px; height: 32px; border-radius: 50%; cursor: pointer;
    border: 3px solid transparent; box-sizing: border-box;
  }
  .editor .swatch[aria-pressed="true"] { border-color: var(--it-editor-text); }
  .editor .tool, .editor .undo {
    all: unset; cursor: pointer; color: var(--it-editor-text); padding: 0.375em 0.625em;
  }
  .editor .undo[disabled] { color: var(--it-editor-disabled); cursor: default; }
`;
