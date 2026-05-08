export const REPORTER_STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
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
  .header h2 { margin: 0; font-size: 16px; font-weight: 600; }
  .close { all: unset; cursor: pointer; padding: 4px 10px; border-radius: 6px; color: #4b5563; }
  .close:hover { background: #f3f4f6; }
  .body { padding: 16px; overflow-y: auto; }
  label { font-size: 13px; color: #4b5563; display: block; margin-bottom: 4px; }
  input[type=text], textarea {
    width: 100%; padding: 8px 10px; border: 1px solid #d1d5db;
    border-radius: 6px; font-size: 14px; color: #111827; background: white;
  }
  textarea { resize: vertical; min-height: 80px; font-family: inherit; }
  input:focus, textarea:focus { outline: 2px solid #2563eb; outline-offset: -1px; border-color: transparent; }
  .types { display: flex; gap: 8px; margin-bottom: 12px; }
  .types button {
    all: unset; flex: 1; padding: 8px; text-align: center;
    border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer;
    font-size: 13px; color: #374151;
  }
  .types button[aria-pressed="true"] { background: #eff6ff; border-color: #2563eb; color: #1d4ed8; }
  .reporter-row {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 12px; font-size: 13px; color: #4b5563;
  }
  .reporter-row button { all: unset; cursor: pointer; color: #2563eb; padding: 2px 6px; }
  .screenshot-toggle {
    display: flex; align-items: center; gap: 8px; margin-top: 12px;
  }
  .screenshot-toggle label { margin: 0; flex: 1; }
  .screenshot-toggle .edit { all: unset; cursor: pointer; color: #2563eb; padding: 2px 6px; font-size: 13px; }
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
    all: unset; cursor: pointer; padding: 8px 16px; border-radius: 6px;
    font-size: 14px; font-weight: 500;
  }
  .footer .secondary { color: #4b5563; }
  .footer .secondary:hover { background: #f3f4f6; }
  .footer .primary { background: #2563eb; color: white; }
  .footer .primary[disabled] { background: #9ca3af; cursor: not-allowed; }
  .error { color: #dc2626; font-size: 13px; margin-top: 8px; }

  /* Name prompt */
  .name-prompt { padding: 24px; text-align: center; }
  .name-prompt h2 { font-size: 18px; margin: 0 0 8px; }
  .name-prompt p { color: #6b7280; font-size: 13px; margin: 0 0 16px; }
  .name-prompt-actions {
    display: flex; gap: 8px; justify-content: center; margin-top: 16px;
  }
  .name-prompt-actions button {
    padding: 8px 16px; border-radius: 6px; font-size: 14px; font-weight: 500;
    cursor: pointer; border: 1px solid #d1d5db; background: white; color: #4b5563;
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
    padding: 8px 12px; font-size: 14px; font-weight: 500;
  }
  .editor .canvas-wrap {
    flex: 1; display: grid; place-items: center; padding: 8px; min-height: 0;
  }
  .editor canvas {
    max-width: 100%; max-height: 100%;
    touch-action: none; cursor: crosshair;
  }
  .editor .toolbar {
    display: flex; justify-content: space-evenly; align-items: center; padding: 12px;
  }
  .editor .swatch {
    width: 32px; height: 32px; border-radius: 50%; cursor: pointer;
    border: 3px solid transparent; box-sizing: border-box;
  }
  .editor .swatch.selected { border-color: white; }
  .editor .undo {
    all: unset; cursor: pointer; color: white; padding: 6px 10px;
  }
  .editor .undo[disabled] { color: #6b7280; cursor: default; }
`;
