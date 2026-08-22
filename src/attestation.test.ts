import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Runtime } from './runtime';

const CONFIG_KEY = 'io.issuetracker.sdk.remoteConfig';

// attestation.ts holds module-level state (current key + fetched
// config); import fresh per test, same pattern as lifecycle.test.ts.
async function importFresh() {
  vi.resetModules();
  return import('./attestation');
}

function runtimeWith(apiKey: string): Runtime {
  return { apiKey, endpoint: 'https://example.invalid/v1' };
}

function stubFetchNetworkError() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('network down'))),
  );
}

function stubFetchConfig(requireTesterAttestation: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ result: { requireTesterAttestation } }), {
          status: 200,
        }),
      ),
    ),
  );
}

describe('attestation fail-mode defaults', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('fails CLOSED for prod-prefixed keys with no cache and no fetch', async () => {
    stubFetchNetworkError();
    const { installAttestation, canTriggerReport } = await importFresh();
    installAttestation(runtimeWith('it_abcdef1234567890'));
    expect(canTriggerReport()).toBe(false);
  });

  it('fails OPEN for dev- and staging-prefixed keys', async () => {
    stubFetchNetworkError();
    const { installAttestation, canTriggerReport } = await importFresh();
    installAttestation(runtimeWith('it_dev_abcdef1234567890'));
    expect(canTriggerReport()).toBe(true);

    const fresh = await importFresh();
    fresh.installAttestation(runtimeWith('it_staging_abcdef1234567890'));
    expect(fresh.canTriggerReport()).toBe(true);
  });

  it('prefers a cached config over the fail-mode default', async () => {
    stubFetchNetworkError();
    window.localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({
        apiKey: 'it_abcdef1234567890',
        requireTesterAttestation: false,
        fetchedAt: 1,
      }),
    );
    const { installAttestation, canTriggerReport } = await importFresh();
    installAttestation(runtimeWith('it_abcdef1234567890'));
    expect(canTriggerReport()).toBe(true);
  });

  it('ignores a cached config recorded for a different key', async () => {
    stubFetchNetworkError();
    window.localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({
        apiKey: 'it_otherkey',
        requireTesterAttestation: false,
        fetchedAt: 1,
      }),
    );
    const { installAttestation, canTriggerReport } = await importFresh();
    installAttestation(runtimeWith('it_abcdef1234567890'));
    expect(canTriggerReport()).toBe(false);
  });
});

describe('remote config fetch', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('adopts and caches the fetched value', async () => {
    stubFetchConfig(true);
    const { installAttestation, refreshRemoteConfig, canTriggerReport } = await importFresh();
    const rt = runtimeWith('it_dev_abcdef1234567890');
    installAttestation(rt);
    await refreshRemoteConfig(rt);
    // dev key would fail open, but the server said testers-only.
    expect(canTriggerReport()).toBe(false);
    const cached = JSON.parse(window.localStorage.getItem(CONFIG_KEY) ?? '{}') as {
      requireTesterAttestation?: boolean;
    };
    expect(cached.requireTesterAttestation).toBe(true);
  });
});

describe('tester token storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('unlocks triggers in testers-only mode when a token is set', async () => {
    stubFetchNetworkError();
    const { installAttestation, canTriggerReport, setTesterToken, clearTesterToken } =
      await importFresh();
    installAttestation(runtimeWith('it_abcdef1234567890'));
    expect(canTriggerReport()).toBe(false);
    setTesterToken('itt_sometoken');
    expect(canTriggerReport()).toBe(true);
    clearTesterToken();
    expect(canTriggerReport()).toBe(false);
  });

  it('treats an expired token as absent', async () => {
    stubFetchNetworkError();
    const { installAttestation, canTriggerReport, setTesterToken, getTesterToken } =
      await importFresh();
    installAttestation(runtimeWith('it_abcdef1234567890'));
    setTesterToken('itt_sometoken', Date.now() - 1000);
    expect(getTesterToken()).toBe(null);
    expect(canTriggerReport()).toBe(false);
  });

  it('honours a future expiry', async () => {
    stubFetchNetworkError();
    const { installAttestation, setTesterToken, getTesterToken } = await importFresh();
    installAttestation(runtimeWith('it_abcdef1234567890'));
    setTesterToken('itt_sometoken', Date.now() + 60_000);
    expect(getTesterToken()).toBe('itt_sometoken');
  });
});
