import type { Runtime, CrashReport } from './runtime';
import { submitReport } from './submit';
import { clearBreadcrumbs } from './breadcrumbs';
import { isLifecycleTerminated, transitionToTerminated } from './lifecycle';
import { enqueueCrash, purgeLocalQueue, takeQueuedCrash } from './queue';
import { ApiError } from './transport';
import { isSdkErrorRecoverable, isSdkErrorTerminal } from './errors';

let installed = false;

export function installCrashHandlers(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const record = (report: CrashReport) => {
    // Decision 9 §2: a TERMINATED install runs no background work.
    // Checked at fire time rather than at install time, so a
    // termination that arrives mid-session takes effect immediately
    // and we never leave a marker behind for the next load to flush.
    if (isLifecycleTerminated()) return;
    enqueueCrash(report);
  };
  window.addEventListener('error', (event) => {
    const err = event.error as Error | undefined;
    record({
      detectedAt: Date.now(),
      exceptionName: err?.name ?? event.message ?? 'Error',
      exceptionReason: err?.message ?? event.message ?? '',
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { message?: string; name?: string } | string | undefined;
    const name =
      typeof reason === 'string'
        ? 'UnhandledPromiseRejection'
        : (reason?.name ?? 'UnhandledPromiseRejection');
    const msg =
      typeof reason === 'string' ? reason : (reason?.message ?? String(reason ?? ''));
    record({
      detectedAt: Date.now(),
      exceptionName: name,
      exceptionReason: msg,
    });
  });
}

/**
 * True when a failed flush should leave the crash on the queue for the
 * next page load. The queue exists so a crash that was never
 * successfully delivered is not silently lost — but only where a retry
 * can plausibly succeed:
 *
 *  - no `ApiError` at all → the fetch never completed (offline, DNS,
 *    CORS preflight). Keep it.
 *  - structured `recoverable: true` (quota, transient) → keep it; this
 *    is exactly the SUSPENDED shape Decision 9 §2 describes.
 *  - a 5xx with no structured details → an unparsed backend blip.
 *    Keep it.
 *  - anything else (a 4xx we cannot interpret, an ADR-0005
 *    tester-gating rejection) → drop it. Re-posting it on every page
 *    load would be the same background hammering Decision 9 forbids,
 *    for a request the server has already refused on its merits.
 *
 * Terminal reasons never reach here: they are handled before this and
 * the queue is purged by the transition itself.
 */
function shouldRequeue(e: unknown): boolean {
  if (!(e instanceof ApiError)) return true;
  if (e.details) return isSdkErrorRecoverable(e.details.error);
  return e.status >= 500;
}

/**
 * Called on configure(). If the previous session left a queued crash
 * (uncaught error or unhandled rejection), send it now and clear the
 * recorded breadcrumbs so they aren't reused on the next manual
 * report.
 */
export async function sendPendingCrashIfAny(rt: Runtime): Promise<void> {
  // Decision 9 §6: a terminated install neither delivers nor keeps the
  // queue. Purge and return without touching the network — this is the
  // background path that would otherwise POST createIssueFromSdk to a
  // dead project on every single page load, forever.
  if (isLifecycleTerminated()) {
    purgeLocalQueue();
    return;
  }
  const report = takeQueuedCrash();
  if (!report) return;
  try {
    await submitReport(rt, {
      title: `Crash: ${report.exceptionName ?? 'Unknown'}`,
      description: report.exceptionReason,
      type: 'bug',
      crashReport: report,
    });
    clearBreadcrumbs();
  } catch (e) {
    // A terminal signal here is exactly as authoritative as one on the
    // interactive submit path, and this is the only path where nobody
    // is watching — swallowing it left the SDK live against a deleted
    // project with no user-visible symptom at all.
    if (e instanceof ApiError && e.details && isSdkErrorTerminal(e.details.error)) {
      transitionToTerminated(e.details.error, rt.onConfigurationError);
      return;
    }
    if (shouldRequeue(e)) enqueueCrash(report);
  }
}
