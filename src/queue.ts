import type { CrashReport } from './runtime';

/**
 * The web SDK's local report queue (ADR-0003 Decision 9 §6).
 *
 * On web the queue is a single slot: the crash marker written by the
 * `error` / `unhandledrejection` handlers, which survives the page
 * unload that follows the crash and is flushed on the next
 * `configure()`. Manual reports are never queued — the reporter form
 * submits in-session and reports its own outcome to the user.
 *
 * It lives in its own module rather than inside `crash.ts` so
 * `lifecycle.ts` can purge it on the TERMINATED transition without
 * importing the crash reporter (which imports the submit path, which
 * would close an import cycle back onto the lifecycle).
 *
 * Invariants:
 *  - the queue is opaque to the host app — no read API is exported
 *    from `index.ts`;
 *  - it is purged atomically on the first TERMINATED signal and stays
 *    purged across reloads, so a dead cohort cannot re-deliver.
 */

const PENDING_CRASH_KEY = 'io.issuetracker.sdk.pendingCrash';

function safeStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && 'localStorage' in window) return window.localStorage;
  } catch {
    /* sandboxed iframe / cookies disabled */
  }
  return null;
}

/** Adds (or restores) the single queued crash. Best-effort. */
export function enqueueCrash(report: CrashReport): void {
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(PENDING_CRASH_KEY, JSON.stringify(report));
  } catch {
    /* quota */
  }
}

/**
 * Removes and returns the queued crash, if any. Removal happens before
 * the send attempt so two overlapping `configure()` calls cannot
 * deliver the same crash twice; a delivery that fails for a
 * *retryable* reason puts it back via {@link enqueueCrash}.
 */
export function takeQueuedCrash(): CrashReport | null {
  const s = safeStorage();
  if (!s) return null;
  let raw: string | null;
  try {
    raw = s.getItem(PENDING_CRASH_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  purgeLocalQueue();
  try {
    return JSON.parse(raw) as CrashReport;
  } catch {
    return null;
  }
}

/** Drops every queued report. Idempotent; safe to call when empty. */
export function purgeLocalQueue(): void {
  const s = safeStorage();
  if (!s) return;
  try {
    s.removeItem(PENDING_CRASH_KEY);
  } catch {
    /* nothing else we can do */
  }
}
