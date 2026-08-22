export const REPORTER_STYLES = `
  /* 1rem pierces the shadow boundary and tracks the user's browser
     default font size (WCAG 1.4.4); all inner sizes are em off this base. */
  :host { all: initial; font-size: 1rem; }
  * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  /* "all: unset" on the buttons below strips the UA focus ring — restore it. */
  button:focus-visible { outline: 2px solid #1577AD; outline-offset: 2px; }
  .sr-only {
    position: absolute; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden;
    clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
  .overlay {
    position: fixed; inset: 0;
    background: rgba(0, 0, 0, 0.45);
    display: grid; place-items: center;
  }
  .sheet {
    background: white;
    width: min(560px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
    display: flex; flex-direction: column;
    overflow: hidden;
    color: #1f2937;
  }
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; border-bottom: 1px solid #e5e7eb;
  }
  .header h2 { margin: 0; font-size: 1em; font-weight: 600; }
  .close { all: unset; cursor: pointer; padding: 0.25em 0.625em; border-radius: 6px; color: #4b5563; }
  .close:hover { background: #f3f4f6; }
  .body { padding: 16px; overflow-y: auto; }
  label { font-size: 0.8125em; color: #4b5563; display: block; margin-bottom: 4px; }
  input[type=text], textarea {
    width: 100%; padding: 0.57143em 0.71429em; border: 1px solid #8D949E;
    border-radius: 6px; font-size: 0.875em; color: #111827; background: white;
  }
  textarea { resize: vertical; min-height: 80px; font-family: inherit; }
  input:focus, textarea:focus { outline: 2px solid #2563eb; outline-offset: -1px; border-color: transparent; }
  .types { display: flex; gap: 8px; margin-bottom: 12px; }
  .types button {
    all: unset; flex: 1; padding: 0.61538em; text-align: center;
    border: 1px solid #8D949E; border-radius: 6px; cursor: pointer;
    font-size: 0.8125em; color: #374151;
  }
  .types button[aria-pressed="true"] { background: #eff6ff; border-color: #2563eb; color: #1d4ed8; font-weight: 600; }
  /* Non-color cue for the selected type (1.4.1); aria-pressed carries it for AT. */
  .types button[aria-pressed="true"]::before { content: "✓ "; }
  .reporter-row {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 12px; font-size: 0.8125em; color: #4b5563;
  }
  .reporter-row button { all: unset; cursor: pointer; color: #2563eb; padding: 0.46154em 0.61538em; }
  .screenshot-toggle {
    display: flex; align-items: center; gap: 8px; margin-top: 12px;
  }
  .screenshot-toggle label { margin: 0; flex: 1; }
  .screenshot-toggle .edit { all: unset; cursor: pointer; color: #2563eb; padding: 0.46154em 0.61538em; font-size: 0.8125em; }
  .preview {
    margin-top: 8px;
    width: 100%; max-height: 240px;
    object-fit: contain;
    background: #f3f4f6;
    border-radius: 6px;
  }
  .footer {
    display: flex; gap: 8px; justify-content: flex-end;
    padding: 12px 16px; border-top: 1px solid #e5e7eb;
  }
  .footer button {
    all: unset; cursor: pointer; padding: 0.57143em 1.14286em; border-radius: 6px;
    font-size: 0.875em; font-weight: 500;
  }
  .footer .secondary { color: #4b5563; }
  .footer .secondary:hover { background: #f3f4f6; }
  .footer .primary { background: #2563eb; color: white; }
  .footer .primary[disabled] { background: #9ca3af; cursor: not-allowed; }
  .footer .primary[aria-disabled="true"] { background: #9ca3af; cursor: default; }
  .error { color: #dc2626; font-size: 0.8125em; margin-top: 8px; }
  .status { color: #15803d; font-size: 0.8125em; margin-top: 8px; }
  .status:empty { display: none; }

  /* Name prompt */
  .name-prompt { padding: 24px; text-align: center; }
  .name-prompt h2 { font-size: 1.125em; margin: 0 0 8px; }
  .name-prompt p { color: #6b7280; font-size: 0.8125em; margin: 0 0 16px; }
  .name-prompt-actions {
    display: flex; gap: 8px; justify-content: center; margin-top: 16px;
  }
  .name-prompt-actions button {
    padding: 0.57143em 1.14286em; border-radius: 6px; font-size: 0.875em; font-weight: 500;
    cursor: pointer; border: 1px solid #8D949E; background: white; color: #4b5563;
  }
  .name-prompt-actions button.primary { background: #2563eb; color: white; border-color: #2563eb; }
  .name-prompt-actions button.primary[disabled] { background: #9ca3af; border-color: #9ca3af; cursor: not-allowed; }

  /* Editor */
  .editor {
    position: fixed; inset: 0; background: #111;
    display: flex; flex-direction: column;
  }
  .editor .topbar {
    display: flex; justify-content: space-between; padding: 8px 12px;
  }
  .editor .topbar button {
    all: unset; cursor: pointer; color: white;
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
  .editor .hbox:focus-visible { outline: 2px dashed #fff; outline-offset: 2px; }
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
  .editor .swatch[aria-pressed="true"] { border-color: white; }
  .editor .tool, .editor .undo {
    all: unset; cursor: pointer; color: white; padding: 0.375em 0.625em;
  }
  .editor .undo[disabled] { color: #6b7280; cursor: default; }
`;
