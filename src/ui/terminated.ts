import { REPORTER_STYLES } from './styles';

/**
 * Shown in place of the report form when the SDK is in the
 * terminated state — the server has signalled that the bound project
 * is gone, the API key is revoked, or the workspace is suspended.
 * No retry button, no raw error code, no link back to our service.
 * ADR-0003 Decision 9.
 *
 * TODO (Phase C+): localise these strings. Held as hardcoded English
 * in Phase C because the rest of the SDK has no i18n infrastructure
 * yet — localising only the terminal view would create inconsistent
 * UX. When i18n lands across the SDK, swap the strings in one pass.
 *
 * Reuses the `.name-prompt` layout (centered, padded card) so the
 * terminal view matches the rest of the SDK's chrome without
 * introducing a new style block.
 */
export function renderTerminated(shadow: ShadowRoot, onClose: () => void): void {
  shadow.innerHTML = `
    <style>${REPORTER_STYLES}</style>
    <div class="overlay">
      <div class="sheet">
        <div class="name-prompt">
          <h2>Bug reporting is no longer available.</h2>
          <p>Contact your team.</p>
          <div class="name-prompt-actions">
            <button id="close" class="primary">Close</button>
          </div>
        </div>
      </div>
    </div>
  `;
  shadow.getElementById('close')?.addEventListener('click', onClose);
}
