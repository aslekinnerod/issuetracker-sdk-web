import { transitionToTerminated } from './lifecycle';
import type { Runtime } from './runtime';
import { ApiError, callFunction } from './transport';
import { isSdkErrorTerminal } from './errors';

/**
 * Tester attestation + remote config (ADR-0005). The server owns one
 * flag today — `requireTesterAttestation` — which decides whether the
 * report triggers work for everyone (open mode) or only on installs
 * holding a valid tester token (testers-only mode).
 *
 * Fail-mode (ADR-0005 Decision 4): the last cached value wins when the
 * config fetch fails. With no cache at all, prod-prefixed keys fail
 * CLOSED (triggers inert until the first successful fetch says open)
 * and dev/staging-prefixed keys fail OPEN. Conservative where real end
 * users are, frictionless where people develop and QA.
 *
 * Web has no companion-app transport (ADR-0005 Decision 2) — the token
 * arrives via the programmatic `Issuetracker.setTesterToken(...)` API,
 * wired by the host app (dogfood) or, later, a browser extension.
 */

const CONFIG_KEY = 'io.issuetracker.sdk.remoteConfig';
const TOKEN_KEY = 'io.issuetracker.sdk.testerToken';
const TOKEN_EXP_KEY = 'io.issuetracker.sdk.testerTokenExpiresAt';

interface CachedConfig {
  apiKey: string;
  requireTesterAttestation: boolean;
  fetchedAt: number;
}

// null = no fetched/cached value yet for the current key; fall back to
// the per-prefix fail-mode default.
let known: { requireTesterAttestation: boolean } | null = null;
let currentApiKey: string | null = null;

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function failModeDefault(apiKey: string): boolean {
  // Returns the requireTesterAttestation value assumed with no data.
  // Prod keys are exactly the ones without an env infix.
  const isProd = !apiKey.startsWith('it_dev_') && !apiKey.startsWith('it_staging_');
  return isProd;
}

function readCache(apiKey: string): { requireTesterAttestation: boolean } | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedConfig>;
    if (parsed.apiKey !== apiKey) return null; // reconfigured with a new key
    if (typeof parsed.requireTesterAttestation !== 'boolean') return null;
    return { requireTesterAttestation: parsed.requireTesterAttestation };
  } catch {
    return null;
  }
}

function writeCache(apiKey: string, requireTesterAttestation: boolean): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    const cached: CachedConfig = {
      apiKey,
      requireTesterAttestation,
      fetchedAt: Date.now(),
    };
    storage.setItem(CONFIG_KEY, JSON.stringify(cached));
  } catch {
    /* best-effort */
  }
}

/**
 * Synchronous part of init: seed the in-memory value from the cache so
 * the very first trigger fires against real data when we have any.
 * The async fetch then reconciles in the background.
 */
export function installAttestation(rt: Runtime): void {
  currentApiKey = rt.apiKey;
  known = readCache(rt.apiKey);
  void refreshRemoteConfig(rt);
}

export async function refreshRemoteConfig(rt: Runtime): Promise<void> {
  try {
    const result = await callFunction<{ requireTesterAttestation: boolean }>(
      rt.endpoint,
      'getSdkConfig',
      { apiKey: rt.apiKey },
    );
    known = { requireTesterAttestation: result.requireTesterAttestation === true };
    writeCache(rt.apiKey, known.requireTesterAttestation);
  } catch (e) {
    // A terminal signal on the config fetch (key revoked, project
    // deleted, …) is as authoritative as one on submission — flip to
    // TERMINATED here too so a dead cohort stops before it ever
    // reaches the report endpoint. Anything else (offline, transient)
    // leaves the cached/fail-mode value in charge.
    if (e instanceof ApiError && e.details && isSdkErrorTerminal(e.details.error)) {
      transitionToTerminated(e.details.error, rt.onConfigurationError);
    }
  }
}

function requireAttestation(): boolean {
  if (known) return known.requireTesterAttestation;
  if (currentApiKey === null) return false; // not configured yet
  return failModeDefault(currentApiKey);
}

/** Valid (non-expired) tester token, or null. */
export function getTesterToken(): string | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const token = storage.getItem(TOKEN_KEY);
    if (!token) return null;
    const expRaw = storage.getItem(TOKEN_EXP_KEY);
    if (expRaw) {
      const exp = Number(expRaw);
      if (Number.isFinite(exp) && exp < Date.now()) return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function setTesterToken(token: string, expiresAt?: number): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(TOKEN_KEY, token);
    if (expiresAt) storage.setItem(TOKEN_EXP_KEY, String(expiresAt));
    else storage.removeItem(TOKEN_EXP_KEY);
  } catch {
    /* best-effort */
  }
}

export function clearTesterToken(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(TOKEN_KEY);
    storage.removeItem(TOKEN_EXP_KEY);
  } catch {
    /* best-effort */
  }
}

/**
 * Gesture-trigger gate. In testers-only mode without a token the
 * triggers are silently inert — no UI, no hint the SDK exists
 * (ADR-0005 invariant 5). The programmatic `report()` path is
 * deliberately NOT gated on this: a host app's own "report a bug"
 * button should surface the attestation error message rather than
 * dying silently.
 */
export function canTriggerReport(): boolean {
  if (!requireAttestation()) return true;
  return getTesterToken() !== null;
}
