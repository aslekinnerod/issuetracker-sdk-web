import type { TerminatedUiStrings } from '../runtime';
import { REPORTER_STYLES } from './styles';

/**
 * Shown in place of the report form when the SDK is in the
 * terminated state — the server has signalled that the bound project
 * is gone, the API key is revoked, or the workspace is suspended.
 * No retry button, no raw error code, no link back to our service.
 * ADR-0003 Decision 9.
 *
 * Strings come from `configure({ terminatedUI })`; English defaults
 * apply for any field the host doesn't override. Sister i18n hooks
 * exist on the native iOS / Android SDKs.
 *
 * Reuses the `.name-prompt` layout (centered, padded card) so the
 * terminal view matches the rest of the SDK's chrome without
 * introducing a new style block.
 */
export const DEFAULT_TERMINATED_TITLE = 'Bug reporting is no longer available.';
export const DEFAULT_TERMINATED_SUBTITLE = 'Contact your team.';
export const DEFAULT_TERMINATED_CLOSE_LABEL = 'Close';

export function renderTerminated(
  shadow: ShadowRoot,
  onClose: () => void,
  strings?: TerminatedUiStrings,
): void {
  const title = strings?.title ?? DEFAULT_TERMINATED_TITLE;
  const subtitle = strings?.subtitle ?? DEFAULT_TERMINATED_SUBTITLE;
  const closeLabel = strings?.closeLabel ?? DEFAULT_TERMINATED_CLOSE_LABEL;
  shadow.innerHTML = `
    <style>${REPORTER_STYLES}</style>
    <div class="overlay">
      <div class="sheet">
        <div class="name-prompt">
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(subtitle)}</p>
          <div class="name-prompt-actions">
            <button id="close" class="primary">${escapeHtml(closeLabel)}</button>
          </div>
        </div>
      </div>
    </div>
  `;
  shadow.getElementById('close')?.addEventListener('click', onClose);
}

// Defence against host-app strings that might contain markup. The
// shadow DOM isolates styles but not XSS — a host that passes
// `title: '<img onerror=...>'` would execute. Escape on render.
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
