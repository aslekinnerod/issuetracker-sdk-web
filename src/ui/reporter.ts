import type { Runtime, IssueReportType } from '../runtime';
import { ISSUE_REPORT_TYPES } from '../runtime';
import { getName, setName, clearName } from '../identity';
import { captureScreenshot } from '../screenshot';
import { submitReport } from '../submit';
import { ApiError } from '../transport';
import { isTesterGatingReason } from '../errors';
import { clearTesterToken, refreshRemoteConfig } from '../attestation';
import { isLifecycleTerminated, transitionToTerminated } from '../lifecycle';
import { REPORTER_STYLES } from './styles';
import { mountEditor } from './editor';
import { renderTerminated } from './terminated';
import { manageModalFocus, type ModalFocusManager } from './focus';

const HOST_ID = 'issuetracker-reporter';
let active = false;

interface Draft {
  title: string;
  description: string;
  type: IssueReportType;
  includeScreenshot: boolean;
  screenshotDataUrl: string | null;
}

/**
 * Top-level entry: captures a screenshot, then mounts the reporter UI
 * inside a closed shadow root. Routes between name-prompt → form →
 * editor depending on state.
 */
export async function openReporter(runtime: Runtime): Promise<void> {
  if (active) return;
  if (typeof document === 'undefined') return;
  active = true;

  const mountShadow = (): {
    shadow: ShadowRoot;
    focus: ModalFocusManager;
    teardown: () => void;
  } => {
    const host = document.createElement('div');
    host.id = HOST_ID;
    // All SDK-injected copy is English regardless of host page language
    // (3.1.2 Language of Parts).
    host.lang = 'en';
    Object.assign(host.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483647',
    });
    const shadow = host.attachShadow({ mode: 'closed' });
    document.body.appendChild(host);
    // Trap focus in the dialog, inert the host page, restore focus to
    // the pre-open element on teardown.
    const focus = manageModalFocus(host, shadow);
    return {
      shadow,
      focus,
      teardown: () => {
        host.remove();
        focus.release();
        active = false;
      },
    };
  };

  // ADR-0003 Decision 9 pre-flight gate. When the SDK has been
  // terminated, every trigger that lands here shows the terminal
  // message instead of the report form — no retry, no error code,
  // no link back to our service. Skip the screenshot capture too:
  // no form will be shown to attach it to.
  if (isLifecycleTerminated()) {
    const { shadow, focus, teardown } = mountShadow();
    focus.setEscapeHandler(teardown);
    renderTerminated(shadow, teardown, runtime.terminatedUI);
    return;
  }

  // Capture BEFORE the reporter UI is in the DOM, otherwise we'd
  // screenshot our own overlay.
  const screenshot = await captureScreenshot();

  const { shadow, focus, teardown } = mountShadow();

  const draft: Draft = {
    title: '',
    description: '',
    type: 'bug',
    includeScreenshot: screenshot !== null,
    screenshotDataUrl: screenshot,
  };

  const render = () => {
    if (getName() === null) {
      renderNamePrompt(
        shadow,
        focus,
        () => render(),
        () => teardown(),
      );
    } else {
      renderReportForm(
        shadow,
        runtime,
        draft,
        focus,
        () => {
          clearName();
          render();
        },
        () => teardown(),
      );
    }
  };
  render();
}

function renderNamePrompt(
  shadow: ShadowRoot,
  focus: ModalFocusManager,
  onContinue: () => void,
  onCancel: () => void,
): void {
  focus.setEscapeHandler(onCancel);
  shadow.innerHTML = `
    <style>${REPORTER_STYLES}</style>
    <div class="overlay">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="it-name-title">
        <div class="name-prompt">
          <h2 id="it-name-title">What should we call you?</h2>
          <p>Shown on issues you report. You can change this later.</p>
          <label for="name" class="sr-only">Your name</label>
          <input type="text" id="name" maxlength="80" placeholder="Your name" />
          <div class="name-prompt-actions">
            <button id="cancel">Cancel</button>
            <button id="continue" class="primary" disabled>Continue</button>
          </div>
        </div>
      </div>
    </div>
  `;
  const input = shadow.getElementById('name') as HTMLInputElement;
  const continueBtn = shadow.getElementById('continue') as HTMLButtonElement;
  const cancelBtn = shadow.getElementById('cancel') as HTMLButtonElement;
  setTimeout(() => input.focus(), 0);

  const submitName = () => {
    const v = input.value.trim();
    if (v.length === 0) return;
    setName(v);
    onContinue();
  };
  input.addEventListener('input', () => {
    continueBtn.disabled = input.value.trim().length === 0;
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitName();
  });
  continueBtn.addEventListener('click', submitName);
  cancelBtn.addEventListener('click', onCancel);
}

function renderReportForm(
  shadow: ShadowRoot,
  runtime: Runtime,
  draft: Draft,
  focus: ModalFocusManager,
  onChangeName: () => void,
  onClose: () => void,
): void {
  focus.setEscapeHandler(onClose);
  const reporterName = getName() ?? 'Anonymous';
  shadow.innerHTML = `
    <style>${REPORTER_STYLES}</style>
    <div class="overlay">
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="it-report-title">
        <div class="header">
          <h2 id="it-report-title">Report an issue</h2>
          <button class="close" id="close">Close</button>
        </div>
        <div class="body">
          <div class="reporter-row">
            <span>From: ${escapeHtml(reporterName)}</span>
            <button id="change-name">Not you?</button>
          </div>
          <div class="types">
            ${ISSUE_REPORT_TYPES.map(
              (t) => `
              <button data-type="${t.value}" aria-pressed="${t.value === draft.type}">${t.label}</button>
            `,
            ).join('')}
          </div>
          <label for="title">Title</label>
          <input type="text" id="title" maxlength="200" value="${escapeAttr(draft.title)}" />
          <div style="height:10px"></div>
          <label for="description">Description (optional)</label>
          <textarea id="description" maxlength="10000">${escapeHtml(draft.description)}</textarea>
          ${
            draft.screenshotDataUrl
              ? `
            <div class="screenshot-toggle">
              <input type="checkbox" id="includeScreenshot" ${draft.includeScreenshot ? 'checked' : ''} />
              <label for="includeScreenshot">Include screenshot</label>
              <button class="edit" id="edit-screenshot">Edit</button>
            </div>
            <img id="preview" class="preview" src="${draft.screenshotDataUrl}" alt="Screenshot preview of this page" style="${draft.includeScreenshot ? '' : 'display:none'}" />
          `
              : ''
          }
          <div class="error" id="error" role="alert" style="display:none"></div>
          <div class="status" id="status" role="status" aria-live="polite"></div>
        </div>
        <div class="footer">
          <button class="secondary" id="cancel">Cancel</button>
          <button class="primary" id="send" disabled>Send report</button>
        </div>
      </div>
    </div>
  `;

  const titleInput = shadow.getElementById('title') as HTMLInputElement;
  const descInput = shadow.getElementById('description') as HTMLTextAreaElement;
  const includeChk = shadow.getElementById('includeScreenshot') as HTMLInputElement | null;
  const previewImg = shadow.getElementById('preview') as HTMLImageElement | null;
  const editBtn = shadow.getElementById('edit-screenshot') as HTMLButtonElement | null;
  const sendBtn = shadow.getElementById('send') as HTMLButtonElement;
  const cancelBtn = shadow.getElementById('cancel') as HTMLButtonElement;
  const closeBtn = shadow.getElementById('close') as HTMLButtonElement;
  const changeNameBtn = shadow.getElementById('change-name') as HTMLButtonElement;
  const errEl = shadow.getElementById('error') as HTMLDivElement;
  const statusEl = shadow.getElementById('status') as HTMLDivElement;

  setTimeout(() => titleInput.focus(), 0);
  sendBtn.disabled = draft.title.trim().length === 0;

  shadow.querySelectorAll('.types button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const t = (btn as HTMLButtonElement).dataset.type as IssueReportType;
      draft.type = t;
      shadow.querySelectorAll('.types button').forEach((b) => {
        b.setAttribute('aria-pressed', String((b as HTMLButtonElement).dataset.type === draft.type));
      });
    });
  });

  titleInput.addEventListener('input', () => {
    draft.title = titleInput.value;
    sendBtn.disabled = draft.title.trim().length === 0;
  });
  descInput.addEventListener('input', () => {
    draft.description = descInput.value;
  });

  if (includeChk && previewImg) {
    includeChk.addEventListener('change', () => {
      draft.includeScreenshot = includeChk.checked;
      previewImg.style.display = draft.includeScreenshot ? '' : 'none';
    });
  }

  if (editBtn && draft.screenshotDataUrl) {
    editBtn.addEventListener('click', async () => {
      const annotated = await mountEditor(shadow, draft.screenshotDataUrl as string, focus);
      if (annotated) draft.screenshotDataUrl = annotated;
      renderReportForm(shadow, runtime, draft, focus, onChangeName, onClose);
    });
  }

  closeBtn.addEventListener('click', onClose);
  cancelBtn.addEventListener('click', onClose);
  changeNameBtn.addEventListener('click', onChangeName);

  sendBtn.addEventListener('click', async () => {
    if (draft.title.trim().length === 0) return;
    if (sendBtn.getAttribute('aria-disabled') === 'true') return;
    // aria-disabled rather than `disabled` while in flight, so the
    // focused Send button doesn't silently drop keyboard focus.
    sendBtn.setAttribute('aria-disabled', 'true');
    sendBtn.textContent = 'Sending…';
    statusEl.textContent = 'Sending…';
    errEl.style.display = 'none';
    try {
      await submitReport(runtime, {
        title: draft.title.trim(),
        description: draft.description.trim() || undefined,
        type: draft.type,
        screenshotDataUrl:
          draft.includeScreenshot && draft.screenshotDataUrl
            ? draft.screenshotDataUrl
            : undefined,
      });
      // Brief visible + politely-announced confirmation before closing
      // instead of silently dismissing (WCAG 4.1.3 Status Messages).
      sendBtn.textContent = 'Sent';
      statusEl.textContent = 'Report sent';
      setTimeout(onClose, 1200);
    } catch (e) {
      statusEl.textContent = '';
      // Tester-gating rejections (ADR-0005) are non-recoverable but
      // NOT terminal — the project is alive, this install just lacks
      // valid attestation. Show a human message, drop any stale token,
      // and re-pull config so the triggers go inert on the next
      // gesture instead of leading users back into this dead end.
      if (
        e instanceof ApiError &&
        e.details &&
        isTesterGatingReason(e.details.error)
      ) {
        if (e.details.error === 'tester_token_invalid') clearTesterToken();
        void refreshRemoteConfig(runtime);
        sendBtn.removeAttribute('aria-disabled');
        sendBtn.textContent = 'Send report';
        errEl.textContent = 'Reporting on this project is limited to enrolled testers.';
        errEl.style.display = '';
        return;
      }
      // ADR-0003 Decision 9: non-recoverable failures flip the SDK
      // into one-way TERMINATED. Swap the form for the terminal view
      // in-place so the user lands on the authoritative end-state
      // immediately, rather than seeing a generic error they cannot
      // retry past.
      if (e instanceof ApiError && e.details && !e.details.recoverable) {
        transitionToTerminated(e.details.error, runtime.onConfigurationError);
        renderTerminated(shadow, onClose, runtime.terminatedUI);
        return;
      }
      sendBtn.removeAttribute('aria-disabled');
      sendBtn.textContent = 'Send report';
      errEl.textContent = (e as Error).message ?? 'Failed to send report';
      errEl.style.display = '';
    }
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;');
}
