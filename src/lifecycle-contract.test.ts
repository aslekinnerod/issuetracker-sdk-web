import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SdkErrorReason } from './errors';

/**
 * ADR-0003 Decision 9 end-to-end contract tests.
 *
 * Where `lifecycle.test.ts` unit-tests the state machine in isolation,
 * this suite drives the *public facade* (`Issuetracker.configure()` /
 * `report()`) against a stubbed `createIssueFromSdk` / `getSdkConfig`
 * callable, so the whole chain is under test: callable wire envelope →
 * `parseSdkErrorDetails` → dispatch → TERMINATED → persistence →
 * queue → triggers → terminal UI.
 *
 * The load-bearing rule the suite enforces: **dispatch is on
 * `details.error`, never on the HTTP status.** Every case therefore
 * pairs a status with a details payload, including deliberately
 * mismatched pairs (a 500 carrying `project_deleted`, a 404 carrying
 * `quota_exceeded`, a 404 carrying no details at all) that a
 * status-driven implementation would get wrong.
 *
 * Cases marked `it.fails` are KNOWN IMPLEMENTATION GAPS: they encode
 * what Decision 9 requires, and they pass *because the assertion
 * inside them currently fails*. Fixing the gap turns them red, which
 * is the signal to flip `it.fails` back to `it`. Each one names the
 * gap it tracks. None are marked today — ITD-163 (one termination
 * predicate on both paths) and ITD-164 (no background traffic once
 * terminated, queue purged) closed the last five.
 *
 * Module-state discipline mirrors lifecycle.test.ts / widget.test.ts:
 * `vi.resetModules()` before each import so module-level singletons
 * (lifecycle state, attestation cache, trigger `installed` guards) do
 * not leak between cases. That same reset doubles as our "process
 * restart" — localStorage survives it, module state does not, which is
 * exactly the tab-reload shape.
 */

// html2canvas is dynamically imported by screenshot.ts; never touch a
// real renderer. Same mocking shape as screenshot.test.ts.
vi.mock('html2canvas-pro', () => ({
  default: vi.fn(async () => ({
    toDataURL: () => 'data:image/jpeg;base64,SHOT',
  })),
}));

const REASON_KEY = 'io.issuetracker.sdk.terminatedReason';
const AT_KEY = 'io.issuetracker.sdk.terminatedAt';
const PENDING_CRASH_KEY = 'io.issuetracker.sdk.pendingCrash';
const NAME_KEY = 'io.issuetracker.sdk.reporterName';
const REPORTER_HOST_ID = 'issuetracker-reporter';

const DEV_KEY = 'it_dev_contracttestkey';

/** The five non-recoverable reasons, with the status Decision 9 pairs them with. */
const NON_RECOVERABLE: Array<[SdkErrorReason, number]> = [
  ['project_deleted', 404],
  ['project_not_found', 404],
  ['api_key_revoked', 403],
  ['workspace_suspended', 403],
  ['invalid_api_key', 401],
];

// ---------------------------------------------------------------------------
// Callable wire helpers
// ---------------------------------------------------------------------------

interface Details {
  error: string;
  recoverable: boolean;
  deletedAt?: number;
  retryAfterSeconds?: number;
}

/** Firebase callable error envelope: {"error":{message,status,details}}. */
function callableError(status: number, details?: Details): Response {
  return new Response(
    JSON.stringify({
      error: {
        message: 'SDK request rejected',
        status: 'FAILED_PRECONDITION',
        ...(details ? { details } : {}),
      },
    }),
    { status },
  );
}

function callableOk(result: unknown): Response {
  return new Response(JSON.stringify({ result }), { status: 200 });
}

type FetchCall = { url: string; body: Record<string, unknown> };
let calls: FetchCall[] = [];

/**
 * Routes `getSdkConfig` to an open-mode config (so ADR-0005 gating
 * never masks a Decision 9 behaviour) and `createIssueFromSdk` to
 * whatever the test wants.
 */
function stubFetchRouted(configResponse: () => Response, issueResponse: () => Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { data: Record<string, unknown> };
      calls.push({ url: String(url), body: body.data });
      if (String(url).endsWith('/getSdkConfig')) return configResponse();
      return issueResponse();
    }),
  );
}

function stubFetch(issueResponse: () => Response): void {
  stubFetchRouted(() => callableOk({ requireTesterAttestation: false }), issueResponse);
}

const issueCalls = (): FetchCall[] => calls.filter((c) => c.url.endsWith('/createIssueFromSdk'));
const configCalls = (): FetchCall[] => calls.filter((c) => c.url.endsWith('/getSdkConfig'));

// ---------------------------------------------------------------------------
// Module / DOM harness
// ---------------------------------------------------------------------------

const realAttach = Element.prototype.attachShadow;
const realWinAdd = window.addEventListener.bind(window);
const realDocAdd = document.addEventListener.bind(document);
let listeners: Array<['w' | 'd', string, EventListenerOrEventListenerObject]> = [];

beforeEach(() => {
  window.localStorage.clear();
  calls = [];
  listeners = [];
  document.getElementById(REPORTER_HOST_ID)?.remove();
  // The SDK asks for a closed shadow root, which a test cannot query.
  // Force it open — nothing about the lifecycle depends on the mode.
  // (Same trick as widget.test.ts.)
  Element.prototype.attachShadow = function attach(this: Element, init: ShadowRootInit) {
    return realAttach.call(this, { ...init, mode: 'open' });
  } as typeof Element.prototype.attachShadow;
  // configure() binds window/document listeners (shortcut, long-press,
  // crash handlers) that outlive vi.resetModules(). Record and unbind
  // them, or a later test's keypress would fire a previous test's
  // module instance and issue phantom requests.
  window.addEventListener = ((t: string, fn: EventListenerOrEventListenerObject, o?: never) => {
    listeners.push(['w', t, fn]);
    realWinAdd(t, fn, o);
  }) as typeof window.addEventListener;
  document.addEventListener = ((t: string, fn: EventListenerOrEventListenerObject, o?: never) => {
    listeners.push(['d', t, fn]);
    realDocAdd(t, fn, o);
  }) as typeof document.addEventListener;
});

afterEach(() => {
  for (const [target, type, fn] of listeners) {
    if (target === 'w') window.removeEventListener(type, fn);
    else document.removeEventListener(type, fn);
  }
  window.addEventListener = realWinAdd as typeof window.addEventListener;
  document.addEventListener = realDocAdd as typeof document.addEventListener;
  Element.prototype.attachShadow = realAttach;
  document.getElementById(REPORTER_HOST_ID)?.remove();
  document.getElementById('issuetracker-floating-widget')?.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Let queued microtasks + `setTimeout(0)` continuations run. */
async function tick(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

interface Sdk {
  Issuetracker: typeof import('./index').Issuetracker;
  isLifecycleTerminated: () => boolean;
}

/**
 * Fresh module registry = a fresh page load. localStorage is NOT
 * cleared, so calling this twice in a test is a process restart.
 */
async function loadSdk(): Promise<Sdk> {
  vi.resetModules();
  const [index, lifecycle] = await Promise.all([import('./index'), import('./lifecycle')]);
  return { Issuetracker: index.Issuetracker, isLifecycleTerminated: lifecycle.isLifecycleTerminated };
}

function configureOptions(
  overrides: Partial<Parameters<typeof import('./index').Issuetracker.configure>[0]> = {},
) {
  return {
    apiKey: DEV_KEY,
    enableCrashReporting: false,
    showFloatingWidget: false,
    longPressToReport: false,
    ...overrides,
  };
}

function reporterShadow(): ShadowRoot {
  const host = document.getElementById(REPORTER_HOST_ID);
  if (!host?.shadowRoot) throw new Error('reporter host not mounted');
  return host.shadowRoot;
}

const isTerminalUi = (): boolean => reporterShadow().getElementById('it-terminated-title') !== null;
const hasReportForm = (): boolean => reporterShadow().getElementById('send') !== null;

/** Opens the reporter, fills in a title and presses Send. */
async function fileReport(sdk: Sdk, title = 'Contract test'): Promise<void> {
  sdk.Issuetracker.report();
  await tick();
  const shadow = reporterShadow();
  const titleInput = shadow.getElementById('title') as HTMLInputElement;
  titleInput.value = title;
  titleInput.dispatchEvent(new Event('input', { bubbles: true }));
  (shadow.getElementById('send') as HTMLButtonElement).click();
  await tick();
}

/** Configure with a pre-seeded reporter name so the name prompt is skipped. */
async function bootConfigured(
  onConfigurationError?: (r: SdkErrorReason) => void,
  overrides: Record<string, unknown> = {},
): Promise<Sdk> {
  window.localStorage.setItem(NAME_KEY, 'Contract Tester');
  const sdk = await loadSdk();
  sdk.Issuetracker.configure(configureOptions({ onConfigurationError, ...overrides }));
  await tick();
  return sdk;
}

// ---------------------------------------------------------------------------
// 1. Dispatch on details.error, not on the HTTP status
// ---------------------------------------------------------------------------

describe('Decision 9 — non-recoverable reasons terminate', () => {
  it.each(NON_RECOVERABLE)(
    '%s (HTTP %i) terminates the SDK and fires onConfigurationError once',
    async (reason, status) => {
      stubFetch(() =>
        callableError(status, {
          error: reason,
          recoverable: false,
          ...(reason === 'project_deleted' ? { deletedAt: 1_747_000_000_000 } : {}),
        }),
      );
      const onConfigurationError = vi.fn();
      const sdk = await bootConfigured(onConfigurationError);

      await fileReport(sdk);

      expect(sdk.isLifecycleTerminated()).toBe(true);
      expect(onConfigurationError).toHaveBeenCalledTimes(1);
      expect(onConfigurationError).toHaveBeenCalledWith(reason);
      // The terminal view replaces the form in place — no stale form
      // with a generic error the user can hammer Send on.
      expect(isTerminalUi()).toBe(true);
      expect(hasReportForm()).toBe(false);
      // Persisted for the next page load.
      expect(window.localStorage.getItem(REASON_KEY)).toBe(reason);
      expect(window.localStorage.getItem(AT_KEY)).toMatch(/^\d+$/);
    },
  );

  it('terminates on a status the contract never mentions, when details say so', async () => {
    // A proxy, a rewritten error, a future server change: the status is
    // 500 but the structured payload is authoritative. A status-driven
    // SDK would treat this as transient and keep hammering.
    stubFetch(() => callableError(500, { error: 'project_deleted', recoverable: false }));
    const onConfigurationError = vi.fn();
    const sdk = await bootConfigured(onConfigurationError);

    await fileReport(sdk);

    expect(sdk.isLifecycleTerminated()).toBe(true);
    expect(onConfigurationError).toHaveBeenCalledWith('project_deleted');
  });

  it('does NOT terminate on a bare 404 with no details object', async () => {
    // 404 alone is indistinguishable from a wrong URL / a bad deploy.
    // Terminating on the status alone would brick a whole cohort on a
    // routing mistake.
    stubFetch(() => callableError(404));
    const onConfigurationError = vi.fn();
    const sdk = await bootConfigured(onConfigurationError);

    await fileReport(sdk);

    expect(sdk.isLifecycleTerminated()).toBe(false);
    expect(onConfigurationError).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(REASON_KEY)).toBeNull();
    // The user keeps a retryable form.
    expect(hasReportForm()).toBe(true);
  });

  it('does NOT terminate on a 404 whose details say the failure is recoverable', async () => {
    stubFetch(() => callableError(404, { error: 'quota_exceeded', recoverable: true }));
    const sdk = await bootConfigured();

    await fileReport(sdk);

    expect(sdk.isLifecycleTerminated()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Recoverable + non-terminal reasons must NOT terminate
// ---------------------------------------------------------------------------

describe('Decision 9 — recoverable reasons keep the SDK alive', () => {
  it('quota_exceeded (429) does not terminate, purge, or disable anything', async () => {
    stubFetch(() =>
      callableError(429, { error: 'quota_exceeded', recoverable: true, retryAfterSeconds: 30 }),
    );
    const onConfigurationError = vi.fn();
    const sdk = await bootConfigured(onConfigurationError);

    await fileReport(sdk);

    expect(sdk.isLifecycleTerminated()).toBe(false);
    expect(onConfigurationError).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(REASON_KEY)).toBeNull();
    // Form still standing, Send re-armed for a retry.
    expect(hasReportForm()).toBe(true);
    expect(reporterShadow().getElementById('send')?.getAttribute('aria-disabled')).not.toBe('true');
    // And a restart must not resurrect a terminated state from nowhere.
    const restarted = await loadSdk();
    restarted.Issuetracker.configure(configureOptions());
    expect(restarted.isLifecycleTerminated()).toBe(false);
  });

  it('transient (503) does not terminate', async () => {
    stubFetch(() => callableError(503, { error: 'transient', recoverable: true }));
    const sdk = await bootConfigured();

    await fileReport(sdk);

    expect(sdk.isLifecycleTerminated()).toBe(false);
  });

  it('tester-gating rejections (ADR-0005) are non-recoverable but NOT terminal', async () => {
    // The project is alive and the key is valid — only this install
    // lacks attestation. Terminating here would be a one-way door on a
    // recoverable enrolment problem.
    stubFetch(() =>
      callableError(403, { error: 'tester_attestation_required', recoverable: false }),
    );
    const onConfigurationError = vi.fn();
    const sdk = await bootConfigured(onConfigurationError);

    await fileReport(sdk);

    expect(sdk.isLifecycleTerminated()).toBe(false);
    expect(onConfigurationError).not.toHaveBeenCalled();
  });

  it(
    'a contradictory {error:"transient", recoverable:false} does NOT terminate the fleet',
    async () => {
      // ITD-163. Both dispatch sites use isSdkErrorTerminal(details.error);
      // neither reads `details.recoverable`. Dispatching on the flag
      // would let a server bug that stamps recoverable:false onto a
      // transient failure permanently brick every deployed install —
      // the single highest-blast-radius write in the SDK, taken on a
      // field the reason enum already answers.
      stubFetch(() => callableError(503, { error: 'transient', recoverable: false }));
      const sdk = await bootConfigured();

      await fileReport(sdk);

      expect(sdk.isLifecycleTerminated()).toBe(false);
      // …and the user keeps a form they can retry from, rather than
      // being shown the terminal end-state.
      expect(isTerminalUi()).toBe(false);
      expect(hasReportForm()).toBe(true);
    },
  );
});

// ---------------------------------------------------------------------------
// 3. Persistence across a restart, and one-way-ness
// ---------------------------------------------------------------------------

describe('Decision 9 — TERMINATED survives a restart', () => {
  it('a terminated install is still terminated after a fresh page load', async () => {
    stubFetch(() => callableError(404, { error: 'project_deleted', recoverable: false }));
    const sdk = await bootConfigured();
    await fileReport(sdk);
    expect(sdk.isLifecycleTerminated()).toBe(true);

    // Restart: new module registry, same localStorage.
    const restarted = await loadSdk();
    expect(restarted.isLifecycleTerminated()).toBe(false); // before configure()
    restarted.Issuetracker.configure(configureOptions());
    expect(restarted.isLifecycleTerminated()).toBe(true); // rehydrated
  });

  it('the restarted install files no report and shows the terminal view', async () => {
    window.localStorage.setItem(REASON_KEY, 'api_key_revoked');
    window.localStorage.setItem(AT_KEY, String(Date.now() - 86_400_000));
    stubFetch(() => callableOk({ issueId: 'i1', projectKey: 'P', number: 1 }));

    const sdk = await bootConfigured();
    expect(sdk.isLifecycleTerminated()).toBe(true);

    sdk.Issuetracker.report();
    await tick();

    expect(isTerminalUi()).toBe(true);
    expect(hasReportForm()).toBe(false);
    expect(issueCalls()).toHaveLength(0);
  });

  it('does not re-fire onConfigurationError on the restart', async () => {
    // The callback marks a *transition*. A rehydrated terminal state is
    // not a new transition; re-firing would spam host telemetry on
    // every page load for the life of the install.
    window.localStorage.setItem(REASON_KEY, 'project_deleted');
    window.localStorage.setItem(AT_KEY, String(Date.now()));
    stubFetch(() => callableOk({ requireTesterAttestation: false }));
    const onConfigurationError = vi.fn();

    await bootConfigured(onConfigurationError);

    expect(onConfigurationError).not.toHaveBeenCalled();
  });
});

describe('Decision 9 — TERMINATED is one-way', () => {
  async function terminate(): Promise<Sdk> {
    stubFetch(() => callableError(403, { error: 'workspace_suspended', recoverable: false }));
    const sdk = await bootConfigured();
    await fileReport(sdk);
    expect(sdk.isLifecycleTerminated()).toBe(true);
    return sdk;
  }

  it('a later successful-looking server response does not revive it', async () => {
    const sdk = await terminate();
    // Server starts answering 200 again (project restored inside the
    // 30-day window). Decision 9: the SDK still does not come back.
    vi.unstubAllGlobals();
    stubFetch(() => callableOk({ issueId: 'i1', projectKey: 'P', number: 1 }));
    calls = [];

    sdk.Issuetracker.report();
    await tick();

    expect(sdk.isLifecycleTerminated()).toBe(true);
    expect(isTerminalUi()).toBe(true);
    expect(issueCalls()).toHaveLength(0);
  });

  it('re-configure() in the same session does not revive it', async () => {
    const sdk = await terminate();
    sdk.Issuetracker.configure(configureOptions());
    await tick();
    expect(sdk.isLifecycleTerminated()).toBe(true);
    expect(window.localStorage.getItem(REASON_KEY)).toBe('workspace_suspended');
  });

  it('configuring with a different API key does not revive it', async () => {
    const sdk = await terminate();
    sdk.Issuetracker.configure(configureOptions({ apiKey: 'it_dev_someotherkey' }));
    await tick();
    expect(sdk.isLifecycleTerminated()).toBe(true);

    // …nor across a restart with the new key.
    const restarted = await loadSdk();
    restarted.Issuetracker.configure(configureOptions({ apiKey: 'it_dev_someotherkey' }));
    expect(restarted.isLifecycleTerminated()).toBe(true);
  });

  it('a clock change does not expire the terminal state', async () => {
    // The marker carries a timestamp; nothing may treat it as a TTL.
    // A device whose clock jumps a year (or backwards past the marker)
    // must stay terminated.
    await terminate();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'));
    let restarted = await loadSdk();
    restarted.Issuetracker.configure(configureOptions());
    expect(restarted.isLifecycleTerminated()).toBe(true);

    vi.setSystemTime(new Date('2000-01-01T00:00:00Z'));
    restarted = await loadSdk();
    restarted.Issuetracker.configure(configureOptions());
    expect(restarted.isLifecycleTerminated()).toBe(true);
    vi.useRealTimers();
  });

  it('keeps the FIRST reason when a second terminal signal arrives', async () => {
    const sdk = await terminate();
    vi.unstubAllGlobals();
    stubFetch(() => callableError(404, { error: 'project_deleted', recoverable: false }));
    sdk.Issuetracker.report();
    await tick();
    expect(window.localStorage.getItem(REASON_KEY)).toBe('workspace_suspended');
  });

  it('a recoverable reason in storage does NOT rehydrate as TERMINATED', async () => {
    // ITD-163, read side. installLifecycle() gates on
    // isSdkErrorTerminal() and not merely on isSdkErrorReason(), so a
    // marker naming a recoverable (or tester-gating) reason — however
    // it got written, e.g. by an older build of the SDK — does not
    // resurrect as a permanently terminated install on every load.
    window.localStorage.setItem(REASON_KEY, 'quota_exceeded');
    window.localStorage.setItem(AT_KEY, String(Date.now()));
    stubFetch(() => callableOk({ requireTesterAttestation: false }));

    const sdk = await bootConfigured();

    expect(sdk.isLifecycleTerminated()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4. Queue purge + no background traffic while terminated
// ---------------------------------------------------------------------------

describe('Decision 9 — local queue is purged, not paused', () => {
  const pendingCrash = () =>
    JSON.stringify({
      detectedAt: 1_747_000_000_000,
      exceptionName: 'TypeError',
      exceptionReason: 'x is not a function',
    });

  it('a terminal signal on a live submit stops any further delivery attempt', async () => {
    stubFetch(() => callableError(404, { error: 'project_deleted', recoverable: false }));
    const sdk = await bootConfigured();
    await fileReport(sdk);
    expect(issueCalls()).toHaveLength(1);

    // Re-open and confirm nothing can be queued or sent any more.
    (reporterShadow().getElementById('close') as HTMLButtonElement).click();
    await tick();
    sdk.Issuetracker.report();
    await tick();
    expect(hasReportForm()).toBe(false);
    expect(issueCalls()).toHaveLength(1);
  });

  it(
    'the queue is neither re-sent nor kept on a load after termination',
    async () => {
      // ITD-164. queue.ts's crash slot IS the web SDK's local queue.
      // Decision 9 §6: drop it atomically on the first TERMINATED
      // signal, and keep the marker so "a process restart does not
      // re-attempt delivery". A terminated install must POST nothing
      // on the background flush path — that is the deployed-cohort
      // hammering Decision 9 exists to prevent — and must leave no
      // queue behind for a later load either.
      window.localStorage.setItem(REASON_KEY, 'project_deleted');
      window.localStorage.setItem(AT_KEY, String(Date.now()));
      window.localStorage.setItem(PENDING_CRASH_KEY, pendingCrash());
      stubFetch(() => callableOk({ issueId: 'i1', projectKey: 'P', number: 1 }));

      await bootConfigured(undefined, { enableCrashReporting: true });

      expect(issueCalls()).toHaveLength(0);
      expect(window.localStorage.getItem(PENDING_CRASH_KEY)).toBeNull();
    },
  );

  it('terminating purges an already-queued crash report', async () => {
    // Queue a crash, then terminate on the manual-report path. The
    // queued item is bound to the project the server just told us is
    // gone, so it must be dropped the moment we terminate rather than
    // linger on disk for the next load to deliver.
    window.localStorage.setItem(PENDING_CRASH_KEY, pendingCrash());
    stubFetch(() => callableError(403, { error: 'api_key_revoked', recoverable: false }));
    const sdk = await bootConfigured();

    await fileReport(sdk);

    expect(sdk.isLifecycleTerminated()).toBe(true);
    expect(window.localStorage.getItem(PENDING_CRASH_KEY)).toBeNull();
  });

  it('a healthy install still fetches config and still flushes the queue', async () => {
    // The guard is on TERMINATED, not on everything. An OK install
    // does all of its background work exactly as before.
    window.localStorage.setItem(PENDING_CRASH_KEY, pendingCrash());
    stubFetch(() => callableOk({ issueId: 'i1', projectKey: 'P', number: 1 }));

    const sdk = await bootConfigured(undefined, { enableCrashReporting: true });

    expect(sdk.isLifecycleTerminated()).toBe(false);
    expect(configCalls()).toHaveLength(1);
    expect(issueCalls()).toHaveLength(1);
    expect(issueCalls()[0].body.crashReport).toBeTruthy();
    // Delivered, so no longer queued.
    expect(window.localStorage.getItem(PENDING_CRASH_KEY)).toBeNull();
  });

  it('a recoverable failure on the flush path keeps the crash queued', async () => {
    // The purge is for reports bound to a dead project. A crash that
    // merely hit a quota or a blip was never delivered anywhere and
    // must survive to the next load — Decision 9 §6 keeps the queue
    // while OK or SUSPENDED.
    window.localStorage.setItem(PENDING_CRASH_KEY, pendingCrash());
    stubFetch(() => callableError(429, { error: 'quota_exceeded', recoverable: true }));

    const sdk = await bootConfigured(undefined, { enableCrashReporting: true });

    expect(issueCalls()).toHaveLength(1);
    expect(sdk.isLifecycleTerminated()).toBe(false);
    expect(window.localStorage.getItem(PENDING_CRASH_KEY)).toBe(pendingCrash());
  });

  it('an offline flush keeps the crash queued', async () => {
    window.localStorage.setItem(PENDING_CRASH_KEY, pendingCrash());
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    const sdk = await bootConfigured(undefined, { enableCrashReporting: true });

    expect(sdk.isLifecycleTerminated()).toBe(false);
    expect(window.localStorage.getItem(PENDING_CRASH_KEY)).toBe(pendingCrash());
  });

  it('a terminal signal on the crash-flush path is dispatched, not swallowed', async () => {
    // ITD-164. The flush used to wrap submitReport in a bare
    // `catch { /* best-effort */ }`, discarding the server's
    // authoritative terminal signal on the one path nobody watches:
    // no TERMINATED transition, no onConfigurationError, and the SDK
    // carrying on offering the reporter against a deleted project.
    window.localStorage.setItem(PENDING_CRASH_KEY, pendingCrash());
    stubFetch(() => callableError(404, { error: 'project_deleted', recoverable: false }));
    const onConfigurationError = vi.fn();

    const sdk = await bootConfigured(onConfigurationError, { enableCrashReporting: true });

    expect(issueCalls()).toHaveLength(1); // the flush attempt happened…
    expect(sdk.isLifecycleTerminated()).toBe(true); // …and must have terminated us
    expect(onConfigurationError).toHaveBeenCalledWith('project_deleted');
  });

  it('a terminated install does not poll getSdkConfig on load', async () => {
    // ITD-164. Decision 9 §2: TERMINATED disables all background
    // tasks. The remote-config refresh is a background task; ungated,
    // every deployed install of a deleted project would keep a
    // per-page-load heartbeat against our backend forever.
    window.localStorage.setItem(REASON_KEY, 'workspace_suspended');
    window.localStorage.setItem(AT_KEY, String(Date.now()));
    stubFetch(() => callableOk({ requireTesterAttestation: false }));

    await bootConfigured();

    expect(configCalls()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Triggers
// ---------------------------------------------------------------------------

describe('Decision 9 — triggers in the terminated state', () => {
  beforeEach(() => {
    window.localStorage.setItem(REASON_KEY, 'project_deleted');
    window.localStorage.setItem(AT_KEY, String(Date.now()));
  });

  it('the keyboard shortcut opens the terminal view and files nothing', async () => {
    stubFetch(() => callableOk({ issueId: 'i1', projectKey: 'P', number: 1 }));
    const sdk = await bootConfigured(undefined, { enableShortcut: true });
    expect(sdk.isLifecycleTerminated()).toBe(true);

    window.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyR', ctrlKey: true, altKey: true, bubbles: true }),
    );
    await tick();

    expect(isTerminalUi()).toBe(true);
    expect(hasReportForm()).toBe(false);
    expect(issueCalls()).toHaveLength(0);
  });

  it('the floating widget opens the terminal view and files nothing', async () => {
    stubFetch(() => callableOk({ issueId: 'i1', projectKey: 'P', number: 1 }));
    await bootConfigured(undefined, { showFloatingWidget: true });

    const widget = document.getElementById('issuetracker-floating-widget');
    const button = widget?.shadowRoot?.querySelector('button') as HTMLElement | null;
    if (!button) throw new Error('floating widget button not mounted');
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await tick();

    expect(isTerminalUi()).toBe(true);
    expect(issueCalls()).toHaveLength(0);
  });

  it('no screenshot is captured for a terminated open', async () => {
    // Decision 9 wants the terminal path cheap: no html2canvas pass, no
    // canvas allocation, on a surface that can never submit.
    const html2canvas = (await import('html2canvas-pro')).default as unknown as ReturnType<
      typeof vi.fn
    >;
    html2canvas.mockClear();
    stubFetch(() => callableOk({ issueId: 'i1', projectKey: 'P', number: 1 }));
    const sdk = await bootConfigured();

    sdk.Issuetracker.report();
    await tick();

    expect(isTerminalUi()).toBe(true);
    expect(html2canvas).not.toHaveBeenCalled();
  });

  it('the terminal view carries no retry affordance and no raw error code', async () => {
    stubFetch(() => callableOk({ issueId: 'i1', projectKey: 'P', number: 1 }));
    const sdk = await bootConfigured();
    sdk.Issuetracker.report();
    await tick();

    const shadow = reporterShadow();
    const text = shadow.textContent ?? '';
    expect(text).toContain('Bug reporting is no longer available.');
    expect(text).toContain('Contact your team.');
    expect(text).not.toContain('project_deleted');
    expect(text).not.toMatch(/retry|try again/i);
    expect(text).not.toContain('issuetracker.no');
    // Exactly one control: Close.
    expect(shadow.querySelectorAll('button')).toHaveLength(1);
  });

  it('no getSdkConfig heartbeat is issued when a trigger fires while terminated', async () => {
    // Decision 9 §2 again, from the other direction: opening the
    // terminal surface is a user-visible action, but it must not turn
    // into background traffic either.
    stubFetch(() => callableOk({ issueId: 'i1', projectKey: 'P', number: 1 }));
    const sdk = await bootConfigured();
    calls = [];

    sdk.Issuetracker.report();
    await tick();

    expect(isTerminalUi()).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('host-supplied terminatedUI strings are used, and are HTML-escaped', async () => {
    stubFetch(() => callableOk({ issueId: 'i1', projectKey: 'P', number: 1 }));
    const sdk = await bootConfigured(undefined, {
      terminatedUI: {
        title: 'Feilrapportering er ikke lenger tilgjengelig.',
        subtitle: 'Kontakt teamet ditt <img src=x onerror=alert(1)>',
        closeLabel: 'Lukk',
      },
    });
    sdk.Issuetracker.report();
    await tick();

    const shadow = reporterShadow();
    expect(shadow.getElementById('it-terminated-title')?.textContent).toBe(
      'Feilrapportering er ikke lenger tilgjengelig.',
    );
    expect(shadow.querySelector('button')?.textContent).toBe('Lukk');
    expect(shadow.querySelector('img')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. ITD-163 — one termination predicate, shared by every path
// ---------------------------------------------------------------------------

/**
 * The whole reason enum, and the terminality the fleet agrees on.
 * Hardcoded rather than imported from ./errors so that a change to the
 * predicate has to be made deliberately in two places — this table is
 * the cross-platform contract (Decision 9 §7: byte-identical wire
 * values and identical semantics on iOS / Android / Web / RN /
 * Flutter), not a restatement of the implementation.
 */
const TERMINALITY: Array<[SdkErrorReason, boolean]> = [
  ['project_deleted', true],
  ['project_not_found', true],
  ['api_key_revoked', true],
  ['workspace_suspended', true],
  ['invalid_api_key', true],
  ['quota_exceeded', false],
  ['transient', false],
  // ADR-0005 tester gating: recoverable:false on the wire, but the
  // project is alive and the key is valid. Never terminal.
  ['tester_attestation_required', false],
  ['tester_token_invalid', false],
];

/** A fresh install: no marker, no queue, no leftover DOM, no stub. */
function resetInstall(): void {
  window.localStorage.clear();
  calls = [];
  document.getElementById(REPORTER_HOST_ID)?.remove();
  document.getElementById('issuetracker-floating-widget')?.remove();
  vi.unstubAllGlobals();
}

/**
 * Drives the interactive submit path. Reports both the lifecycle
 * outcome and whether the UI swapped to the terminal view — the second
 * is what catches a call site that reads the wrong field but is saved
 * from persisting it by the guard inside `transitionToTerminated`.
 */
async function terminatesViaSubmit(details: Details): Promise<boolean> {
  resetInstall();
  // Status 500 throughout: it matches none of the reasons' documented
  // statuses, so a status-driven implementation cannot accidentally
  // agree with a reason-driven one.
  stubFetch(() => callableError(500, details));
  const sdk = await bootConfigured();
  await fileReport(sdk);
  const terminated = sdk.isLifecycleTerminated();
  expect(isTerminalUi()).toBe(terminated);
  return terminated;
}

/** Drives the background config path and reports whether it terminated. */
async function terminatesViaConfig(details: Details): Promise<boolean> {
  resetInstall();
  stubFetchRouted(
    () => callableError(500, details),
    () => callableOk({ issueId: 'i1', projectKey: 'P', number: 1 }),
  );
  const sdk = await bootConfigured();
  return sdk.isLifecycleTerminated();
}

describe('Decision 9 — every path shares one termination predicate', () => {
  it.each(TERMINALITY)(
    '%s terminates=%s on the submit path and the config path alike',
    async (reason, terminal) => {
      // `recoverable` is varied deliberately: the two paths must agree
      // with each other AND with the reason table regardless of what
      // the flag says, which is only true if both dispatch on
      // `details.error`. A path reading `!details.recoverable` fails
      // the `recoverable: false` row for the four non-terminal reasons
      // and the `recoverable: true` row for the five terminal ones.
      for (const recoverable of [true, false]) {
        const details: Details = { error: reason, recoverable };
        expect(await terminatesViaSubmit(details)).toBe(terminal);
        expect(await terminatesViaConfig(details)).toBe(terminal);
      }
    },
  );
});
