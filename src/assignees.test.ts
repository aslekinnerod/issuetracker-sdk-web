import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ITD-266 — "Assign to" in the report form, tester sessions only.
 *
 * The rule under test: an ordinary end user of the host app never
 * causes a `listSdkAssignees` request and never sees the picker; a
 * tester session fetches lazily when the form opens, and the tester's
 * choice (if any) rides along as `assigneeId`.
 */

vi.mock('html2canvas-pro', () => ({
  default: vi.fn(async () => ({ toDataURL: () => 'data:image/jpeg;base64,SHOT' })),
}));

const NAME_KEY = 'io.issuetracker.sdk.reporterName';
const TOKEN_KEY = 'io.issuetracker.sdk.testerToken';
const TOKEN_EXP_KEY = 'io.issuetracker.sdk.testerTokenExpiresAt';
const REPORTER_HOST_ID = 'issuetracker-reporter';
const DEV_KEY = 'it_dev_assigneetestkey';

const MEMBERS = {
  assignees: [
    { userId: 'u-ada', displayName: 'Ada' },
    { userId: 'u-bob', displayName: '<b>Bob</b>' },
  ],
  defaultAssigneeId: 'u-bob',
};

type FetchCall = { url: string; body: Record<string, unknown> };
let calls: FetchCall[] = [];

function ok(result: unknown): Response {
  return new Response(JSON.stringify({ result }), { status: 200 });
}

function rejected(status: number, error: string): Response {
  return new Response(
    JSON.stringify({
      error: { message: 'no', status: 'PERMISSION_DENIED', details: { error, recoverable: false } },
    }),
    { status },
  );
}

function stubFetch(assignees: () => Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { data: Record<string, unknown> };
      calls.push({ url: String(url), body: body.data });
      if (String(url).endsWith('/getSdkConfig')) return ok({ requireTesterAttestation: false });
      if (String(url).endsWith('/listSdkAssignees')) return assignees();
      return ok({ issueId: 'i1', projectKey: 'ABC', number: 1 });
    }),
  );
}

const callsTo = (fn: string) => calls.filter((c) => c.url.endsWith(`/${fn}`));

const realAttach = Element.prototype.attachShadow;
const realWinAdd = window.addEventListener.bind(window);
const realDocAdd = document.addEventListener.bind(document);
let listeners: Array<['w' | 'd', string, EventListenerOrEventListenerObject]> = [];

beforeEach(() => {
  window.localStorage.clear();
  calls = [];
  listeners = [];
  document.getElementById(REPORTER_HOST_ID)?.remove();
  Element.prototype.attachShadow = function attach(this: Element, init: ShadowRootInit) {
    return realAttach.call(this, { ...init, mode: 'open' });
  } as typeof Element.prototype.attachShadow;
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
  vi.unstubAllGlobals();
});

async function tick(rounds = 8): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function bootAndOpen(opts: { tester: boolean }) {
  window.localStorage.setItem(NAME_KEY, 'Tess Tester');
  if (opts.tester) window.localStorage.setItem(TOKEN_KEY, 'itt_testertoken');
  vi.resetModules();
  const { Issuetracker } = await import('./index');
  Issuetracker.configure({
    apiKey: DEV_KEY,
    enableCrashReporting: false,
    showFloatingWidget: false,
    longPressToReport: false,
    enableShortcut: false,
  });
  await tick();
  Issuetracker.report();
  await tick();
  const host = document.getElementById(REPORTER_HOST_ID);
  if (!host?.shadowRoot) throw new Error('reporter host not mounted');
  return host.shadowRoot;
}

async function send(shadow: ShadowRoot): Promise<Record<string, unknown>> {
  const title = shadow.getElementById('title') as HTMLInputElement;
  title.value = 'Assign me';
  title.dispatchEvent(new Event('input', { bubbles: true }));
  (shadow.getElementById('send') as HTMLButtonElement).click();
  await tick();
  const issue = callsTo('createIssueFromSdk');
  expect(issue).toHaveLength(1);
  return issue[0]!.body;
}

describe('non-tester sessions', () => {
  it('make no assignee request and show no picker', async () => {
    stubFetch(() => ok(MEMBERS));
    const shadow = await bootAndOpen({ tester: false });

    expect(callsTo('listSdkAssignees')).toHaveLength(0);
    expect(shadow.getElementById('assignee')).toBeNull();

    const body = await send(shadow);
    expect('assigneeId' in body).toBe(false);
  });
});

describe('tester sessions', () => {
  it('fetch lazily on open with key + token, and show a labelled picker', async () => {
    stubFetch(() => ok(MEMBERS));
    const shadow = await bootAndOpen({ tester: true });

    const req = callsTo('listSdkAssignees');
    expect(req).toHaveLength(1);
    expect(req[0]!.body).toEqual({ apiKey: DEV_KEY, testerToken: 'itt_testertoken' });

    const select = shadow.getElementById('assignee') as HTMLSelectElement;
    expect(select).not.toBeNull();
    const label = shadow.querySelector('label[for="assignee"]');
    expect(label?.textContent).toBe('Assign to (optional)');
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ['', 'Unassigned'],
      ['u-ada', 'Ada'],
      // Rendered as text, never as markup.
      ['u-bob', '<b>Bob</b>'],
    ]);
    expect(select.querySelector('b')).toBeNull();
    // The triage default is preselected.
    expect(select.value).toBe('u-bob');
  });

  it('leave assigneeId off when the picker is untouched (server applies the default)', async () => {
    stubFetch(() => ok(MEMBERS));
    const shadow = await bootAndOpen({ tester: true });
    const body = await send(shadow);
    expect('assigneeId' in body).toBe(false);
    expect(body.testerToken).toBe('itt_testertoken');
  });

  it('send the chosen member', async () => {
    stubFetch(() => ok(MEMBERS));
    const shadow = await bootAndOpen({ tester: true });
    const select = shadow.getElementById('assignee') as HTMLSelectElement;
    select.value = 'u-ada';
    select.dispatchEvent(new Event('change'));
    const body = await send(shadow);
    expect(body.assigneeId).toBe('u-ada');
  });

  it('send null for an explicit "Unassigned"', async () => {
    stubFetch(() => ok(MEMBERS));
    const shadow = await bootAndOpen({ tester: true });
    const select = shadow.getElementById('assignee') as HTMLSelectElement;
    select.value = '';
    select.dispatchEvent(new Event('change'));
    const body = await send(shadow);
    expect(body.assigneeId).toBeNull();
  });

  it('show no picker when the fetch fails, and the report still sends', async () => {
    stubFetch(() => new Response('boom', { status: 500 }));
    const shadow = await bootAndOpen({ tester: true });
    expect(shadow.getElementById('assignee')).toBeNull();
    const body = await send(shadow);
    expect('assigneeId' in body).toBe(false);
  });

  it('drop a token the server rejects, and show no picker', async () => {
    stubFetch(() => rejected(403, 'tester_token_invalid'));
    const shadow = await bootAndOpen({ tester: true });
    expect(shadow.getElementById('assignee')).toBeNull();
    expect(window.localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('show no picker for an empty member list', async () => {
    stubFetch(() => ok({ assignees: [], defaultAssigneeId: null }));
    const shadow = await bootAndOpen({ tester: true });
    expect(shadow.getElementById('assignee')).toBeNull();
  });
});

describe('fetchAssigneeOptions', () => {
  it('keeps only userId + displayName and adopts a renewed token expiry', async () => {
    window.localStorage.setItem(TOKEN_KEY, 'itt_testertoken');
    stubFetch(() =>
      ok({
        assignees: [{ userId: 'u1', displayName: 'Ada', email: 'ada@example.com' }, { bad: 1 }],
        defaultAssigneeId: 'not-in-list',
        testerTokenExpiresAt: 4_102_444_800_000,
      }),
    );
    vi.resetModules();
    const { fetchAssigneeOptions } = await import('./assignees');
    const result = await fetchAssigneeOptions({ apiKey: DEV_KEY, endpoint: 'https://x.invalid/v1' });
    expect(result).toEqual({
      assignees: [{ userId: 'u1', displayName: 'Ada' }],
      defaultAssigneeId: null,
    });
    expect(window.localStorage.getItem(TOKEN_EXP_KEY)).toBe('4102444800000');
  });

  it('returns null without a token and makes no request', async () => {
    stubFetch(() => ok(MEMBERS));
    vi.resetModules();
    const { fetchAssigneeOptions } = await import('./assignees');
    expect(
      await fetchAssigneeOptions({ apiKey: DEV_KEY, endpoint: 'https://x.invalid/v1' }),
    ).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
