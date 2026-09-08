import { isSdkErrorReason, isSdkErrorTerminal, type SdkErrorReason } from './errors';
import { purgeLocalQueue } from './queue';

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
  // Rehydration uses the same predicate as the write paths
  // (ITD-163): a marker naming a non-terminal reason — a recoverable
  // one, or an ADR-0005 tester-gating rejection — is not a terminal
  // state and must not brick the install. Anything unparseable or
  // non-terminal is dropped rather than trusted.
  if (raw && isSdkErrorReason(raw) && isSdkErrorTerminal(raw)) {
    const atStr = storage.getItem(AT_KEY);
    const at = atStr ? Number(atStr) : Date.now();
    state = { kind: 'terminated', reason: raw, atMillis: at };
    // Decision 9 §6: the purge must survive a reload. Re-running it on
    // every rehydration covers the case where the process died between
    // writing the marker and emptying the queue, and the case where
    // something queued a report after the marker was written.
    purgeLocalQueue();
  }
}

export function isLifecycleTerminated(): boolean {
  return state.kind === 'terminated';
}

/**
 * Idempotent: re-terminating with a different reason keeps the first
 * one. The first terminal failure is authoritative; later failures
 * should have been gated and only happen if a pre-flight check missed
 * the state.
 *
 * Non-terminal reasons are refused outright. Callers are expected to
 * have consulted `isSdkErrorTerminal` already (ITD-163), but this is
 * the one-way door in the SDK and the highest blast-radius write we
 * make — it enforces the predicate at the sink as well.
 */
export function transitionToTerminated(
  reason: SdkErrorReason,
  callback: ((reason: SdkErrorReason) => void) | undefined,
): void {
  if (!isSdkErrorTerminal(reason)) return;
  if (state.kind === 'terminated') return;
  const now = Date.now();
  state = { kind: 'terminated', reason, atMillis: now };
  // Decision 9 §6: drop the local queue atomically with the
  // transition, before anything can flush it. Nothing in the queue is
  // deliverable — every queued item is bound to the project the
  // server has just told us is gone.
  purgeLocalQueue();
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
