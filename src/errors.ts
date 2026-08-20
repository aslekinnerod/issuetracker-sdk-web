/**
 * Machine-readable reason for an SDK-callable failure. The string
 * values match the server-side `SdkErrorReasonSchema` in
 * `@issuetracker/shared` byte-for-byte — they are the wire contract
 * across all five SDKs. See ADR-0003 Decision 9.
 *
 * Recoverable reasons (`quota_exceeded`, `transient`) keep the SDK in
 * the OK state and rely on the user retrying via the existing UI.
 * Non-recoverable reasons transition the SDK into a one-way
 * TERMINATED state — see ./lifecycle.
 */
export type SdkErrorReason =
  | 'project_deleted'
  | 'project_not_found'
  | 'api_key_revoked'
  | 'workspace_suspended'
  | 'invalid_api_key'
  | 'quota_exceeded'
  | 'transient'
  | 'tester_attestation_required'
  | 'tester_token_invalid';

const SDK_ERROR_REASONS: ReadonlySet<string> = new Set<SdkErrorReason>([
  'project_deleted',
  'project_not_found',
  'api_key_revoked',
  'workspace_suspended',
  'invalid_api_key',
  'quota_exceeded',
  'transient',
  'tester_attestation_required',
  'tester_token_invalid',
]);

const RECOVERABLE_REASONS: ReadonlySet<SdkErrorReason> = new Set([
  'quota_exceeded',
  'transient',
]);

// Tester-gating rejections (ADR-0005) are non-recoverable — retrying
// the same request cannot succeed — but they are NOT terminal: the
// project is alive, the key is valid, only this install lacks (valid)
// attestation. The SDK must never flip to TERMINATED on them.
const NON_TERMINAL_REASONS: ReadonlySet<SdkErrorReason> = new Set([
  'quota_exceeded',
  'transient',
  'tester_attestation_required',
  'tester_token_invalid',
]);

export function isSdkErrorRecoverable(reason: SdkErrorReason): boolean {
  return RECOVERABLE_REASONS.has(reason);
}

export function isSdkErrorTerminal(reason: SdkErrorReason): boolean {
  return !NON_TERMINAL_REASONS.has(reason);
}

export function isTesterGatingReason(reason: SdkErrorReason): boolean {
  return reason === 'tester_attestation_required' || reason === 'tester_token_invalid';
}

export function isSdkErrorReason(value: unknown): value is SdkErrorReason {
  return typeof value === 'string' && SDK_ERROR_REASONS.has(value);
}

/**
 * Structured failure payload parsed out of the server's HttpsError
 * `details` object. Internal — host apps only see [SdkErrorReason]
 * via the `onConfigurationError` callback.
 */
export interface SdkErrorDetails {
  error: SdkErrorReason;
  recoverable: boolean;
  deletedAt?: number;
  retryAfterSeconds?: number;
}

export function parseSdkErrorDetails(json: unknown): SdkErrorDetails | null {
  if (json == null || typeof json !== 'object') return null;
  const obj = json as Record<string, unknown>;
  if (!isSdkErrorReason(obj.error)) return null;
  if (typeof obj.recoverable !== 'boolean') return null;
  const details: SdkErrorDetails = {
    error: obj.error,
    recoverable: obj.recoverable,
  };
  if (typeof obj.deletedAt === 'number') details.deletedAt = obj.deletedAt;
  if (typeof obj.retryAfterSeconds === 'number') {
    details.retryAfterSeconds = obj.retryAfterSeconds;
  }
  return details;
}
