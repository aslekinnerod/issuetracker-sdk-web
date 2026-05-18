import { beforeEach, describe, expect, it, vi } from 'vitest';

const REASON_KEY = 'io.issuetracker.sdk.terminatedReason';
const AT_KEY = 'io.issuetracker.sdk.terminatedAt';

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
