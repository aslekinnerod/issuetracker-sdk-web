import type { Runtime, CrashReport } from './runtime';
import { submitReport } from './submit';
import { clearBreadcrumbs } from './breadcrumbs';

const PENDING_KEY = 'io.issuetracker.sdk.pendingCrash';
let installed = false;

function safeStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && 'localStorage' in window) return window.localStorage;
  } catch {
    /* sandboxed */
  }
  return null;
}

function writePending(report: CrashReport): void {
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(PENDING_KEY, JSON.stringify(report));
  } catch {
    /* quota */
  }
}

export function installCrashHandlers(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (event) => {
    const err = event.error as Error | undefined;
    writePending({
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
    writePending({
      detectedAt: Date.now(),
      exceptionName: name,
      exceptionReason: msg,
    });
  });
}

/**
 * Called on configure(). If the previous session left a pending crash
 * marker (uncaught error or unhandled rejection), send it now and
 * clear the recorded breadcrumbs so they aren't reused on the next
 * manual report.
 */
export async function sendPendingCrashIfAny(rt: Runtime): Promise<void> {
  const s = safeStorage();
  if (!s) return;
  let raw: string | null;
  try {
    raw = s.getItem(PENDING_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    s.removeItem(PENDING_KEY);
  } catch {
    /* fine */
  }
  let report: CrashReport;
  try {
    report = JSON.parse(raw) as CrashReport;
  } catch {
    return;
  }
  try {
    await submitReport(rt, {
      title: `Crash: ${report.exceptionName ?? 'Unknown'}`,
      description: report.exceptionReason,
      type: 'bug',
      crashReport: report,
    });
    clearBreadcrumbs();
  } catch {
    /* best-effort — don't propagate */
  }
}
