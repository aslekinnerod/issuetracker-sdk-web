import { isSdkErrorReason, type SdkErrorReason } from './errors';

/**
 * One-way SDK lifecycle state. See ADR-0003 Decision 9.
 *
 * Starts in `ok`. The first non-recoverable server error transitions
 * to `terminated` and the SDK stays there for the lifetime of the
 * install — recovery requires an explicit host-app re-init (typically
 * a fresh page load with new configure() options), never a poll, so a
 * deployed cohort cannot hammer a dead endpoint regardless of scale.
 *
 * `suspended` is reserved for a future per-report retry queue and is
 * not produced today; recoverable errors keep the SDK in `ok` and rely
 * on the user retrying via the existing UI.
 *
 * Persisted in localStorage so a page reload does not re-attempt
 * delivery against an endpoint the server has already told us is gone.
 */
type LifecycleState =
  | { kind: 'ok' }
  | { kind: 'suspended' }
  | { kind: 'terminated'; reason: SdkErrorReason; atMillis: number };

const REASON_KEY = 'io.issuetracker.sdk.terminatedReason';
const AT_KEY = 'io.issuetracker.sdk.terminatedAt';

let state: LifecycleState = { kind: 'ok' };
let storage: Storage | null = null;
let installed = false;

function safeLocalStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    // Cookies disabled / file:// scheme / SecurityError on some
    // sandboxed iframes. Persistence is best-effort — terminated
    // state still applies for the current session.
    return null;
  }
}

export function installLifecycle(): void {
  if (installed) return;
  installed = true;
  storage = safeLocalStorage();
  if (!storage) return;
  const raw = storage.getItem(REASON_KEY);
  if (raw && isSdkErrorReason(raw)) {
    const atStr = storage.getItem(AT_KEY);
    const at = atStr ? Number(atStr) : Date.now();
    state = { kind: 'terminated', reason: raw, atMillis: at };
  }
}

export function isLifecycleTerminated(): boolean {
  return state.kind === 'terminated';
}

/**
 * Idempotent: re-terminating with a different reason keeps the first
 * one. The first non-recoverable failure is authoritative; later
 * failures should have been gated and only happen if a pre-flight
 * check missed the state.
 */
export function transitionToTerminated(
  reason: SdkErrorReason,
  callback: ((reason: SdkErrorReason) => void) | undefined,
): void {
  if (state.kind === 'terminated') return;
  const now = Date.now();
  state = { kind: 'terminated', reason, atMillis: now };
  if (storage) {
    try {
      storage.setItem(REASON_KEY, reason);
      storage.setItem(AT_KEY, String(now));
    } catch {
      // Quota or storage blocked; non-fatal — terminated state still
      // applies for the current session.
    }
  }
  if (callback) callback(reason);
}
