import { beforeEach, describe, expect, it, vi } from 'vitest';

const REASON_KEY = 'io.issuetracker.sdk.terminatedReason';
const AT_KEY = 'io.issuetracker.sdk.terminatedAt';
const PENDING_CRASH_KEY = 'io.issuetracker.sdk.pendingCrash';

// lifecycle.ts holds module-level state for the one-way transition.
// Each test imports the module fresh via `vi.resetModules()` so the
// state doesn't leak between cases. Mirror this pattern in any
// future SDK contract tests.
async function importFresh() {
  vi.resetModules();
  return import('./lifecycle');
}

describe('lifecycle state machine', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts in the OK state', async () => {
    const { installLifecycle, isLifecycleTerminated } = await importFresh();
    installLifecycle();
    expect(isLifecycleTerminated()).toBe(false);
  });

  it('transitions to TERMINATED on a non-recoverable signal', async () => {
    const {
      installLifecycle,
      isLifecycleTerminated,
      transitionToTerminated,
    } = await importFresh();
    installLifecycle();
    transitionToTerminated('workspace_suspended', undefined);
    expect(isLifecycleTerminated()).toBe(true);
  });

  it('fires the host-app callback exactly once on first transition', async () => {
    const { installLifecycle, transitionToTerminated } = await importFresh();
    installLifecycle();
    const cb = vi.fn();
    transitionToTerminated('workspace_suspended', cb);
    transitionToTerminated('project_deleted', cb);
    transitionToTerminated('api_key_revoked', cb);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('workspace_suspended');
  });

  it('persists the terminated reason to localStorage', async () => {
    const { installLifecycle, transitionToTerminated } = await importFresh();
    installLifecycle();
    transitionToTerminated('project_deleted', undefined);
    expect(window.localStorage.getItem(REASON_KEY)).toBe('project_deleted');
    expect(window.localStorage.getItem(AT_KEY)).toMatch(/^\d+$/);
  });

  it('rehydrates TERMINATED from localStorage on a fresh install', async () => {
    // Simulate a previous session having persisted the terminated
    // state, then opening a new tab. A fresh module load must read
    // the marker and refuse further reports immediately.
    window.localStorage.setItem(REASON_KEY, 'workspace_suspended');
    window.localStorage.setItem(AT_KEY, '1747000000000');

    const { installLifecycle, isLifecycleTerminated } = await importFresh();
    installLifecycle();
    expect(isLifecycleTerminated()).toBe(true);
  });

  it('refuses to terminate on a non-terminal reason', async () => {
    // ITD-163: the predicate is enforced at the sink too, so no caller
    // can walk the SDK through the one-way door on a recoverable or an
    // ADR-0005 tester-gating reason.
    const { installLifecycle, isLifecycleTerminated, transitionToTerminated } =
      await importFresh();
    installLifecycle();
    const cb = vi.fn();
    transitionToTerminated('quota_exceeded', cb);
    transitionToTerminated('transient', cb);
    transitionToTerminated('tester_attestation_required', cb);
    transitionToTerminated('tester_token_invalid', cb);
    expect(isLifecycleTerminated()).toBe(false);
    expect(cb).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(REASON_KEY)).toBeNull();
  });

  it('purges the local queue as part of the transition', async () => {
    // Decision 9 §6 — atomically with the transition, before anything
    // can flush it.
    window.localStorage.setItem(PENDING_CRASH_KEY, '{"detectedAt":1}');
    const { installLifecycle, transitionToTerminated } = await importFresh();
    installLifecycle();
    transitionToTerminated('project_deleted', undefined);
    expect(window.localStorage.getItem(PENDING_CRASH_KEY)).toBeNull();
  });

  it('purges the local queue when rehydrating a terminated marker', async () => {
    window.localStorage.setItem(REASON_KEY, 'project_deleted');
    window.localStorage.setItem(AT_KEY, '1747000000000');
    window.localStorage.setItem(PENDING_CRASH_KEY, '{"detectedAt":1}');
    const { installLifecycle, isLifecycleTerminated } = await importFresh();
    installLifecycle();
    expect(isLifecycleTerminated()).toBe(true);
    expect(window.localStorage.getItem(PENDING_CRASH_KEY)).toBeNull();
  });

  it('leaves the queue alone while OK', async () => {
    window.localStorage.setItem(PENDING_CRASH_KEY, '{"detectedAt":1}');
    const { installLifecycle } = await importFresh();
    installLifecycle();
    expect(window.localStorage.getItem(PENDING_CRASH_KEY)).toBe('{"detectedAt":1}');
  });

  it('ignores a non-terminal reason in localStorage (stays OK)', async () => {
    window.localStorage.setItem(REASON_KEY, 'quota_exceeded');
    window.localStorage.setItem(AT_KEY, '1747000000000');

    const { installLifecycle, isLifecycleTerminated } = await importFresh();
    installLifecycle();
    expect(isLifecycleTerminated()).toBe(false);
  });

  it('ignores a malformed reason in localStorage (stays OK)', async () => {
    window.localStorage.setItem(REASON_KEY, 'workspace_deleted'); // misnomer
    window.localStorage.setItem(AT_KEY, '1747000000000');

    const { installLifecycle, isLifecycleTerminated } = await importFresh();
    installLifecycle();
    expect(isLifecycleTerminated()).toBe(false);
  });

  it('is idempotent: installing twice does not reset state', async () => {
    const {
      installLifecycle,
      isLifecycleTerminated,
      transitionToTerminated,
    } = await importFresh();
    installLifecycle();
    transitionToTerminated('workspace_suspended', undefined);
    installLifecycle(); // second install — must be a no-op
    expect(isLifecycleTerminated()).toBe(true);
  });

  it('preserves the FIRST terminated reason if a second signal arrives', async () => {
    // Server says workspace_suspended first; a later report somehow
    // gets project_deleted. The lifecycle should keep the first
    // reason — the audit value is which signal caused termination,
    // not the most recent one.
    const { installLifecycle, transitionToTerminated } = await importFresh();
    installLifecycle();
    transitionToTerminated('workspace_suspended', undefined);
    transitionToTerminated('project_deleted', undefined);
    expect(window.localStorage.getItem(REASON_KEY)).toBe('workspace_suspended');
  });
});
