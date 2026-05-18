import { describe, expect, it } from 'vitest';
import {
  isSdkErrorReason,
  isSdkErrorRecoverable,
  parseSdkErrorDetails,
  type SdkErrorReason,
} from './errors';

// Contract tests for the SDK error wire format. The values here MUST
// match @issuetracker/shared SdkErrorReasonSchema byte-for-byte —
// any drift breaks the lifecycle transition logic in lifecycle.ts.
//
// See ADR-0003 Decision 9.

describe('isSdkErrorReason', () => {
  it.each([
    'project_deleted',
    'project_not_found',
    'api_key_revoked',
    'workspace_suspended',
    'invalid_api_key',
    'quota_exceeded',
    'transient',
  ])('accepts canonical reason %s', (reason) => {
    expect(isSdkErrorReason(reason)).toBe(true);
  });

  it.each([
    'workspace_deleted', // common misnomer — must NOT match
    'WORKSPACE_SUSPENDED', // wrong casing
    '',
    null,
    undefined,
    42,
    { error: 'project_deleted' },
  ])('rejects %s', (value) => {
    expect(isSdkErrorReason(value)).toBe(false);
  });
});

describe('isSdkErrorRecoverable', () => {
  it('marks quota_exceeded and transient as recoverable', () => {
    expect(isSdkErrorRecoverable('quota_exceeded')).toBe(true);
    expect(isSdkErrorRecoverable('transient')).toBe(true);
  });

  it.each<SdkErrorReason>([
    'project_deleted',
    'project_not_found',
    'api_key_revoked',
    'workspace_suspended',
    'invalid_api_key',
  ])('marks %s as non-recoverable (terminates SDK)', (reason) => {
    expect(isSdkErrorRecoverable(reason)).toBe(false);
  });
});

describe('parseSdkErrorDetails', () => {
  it('parses a well-formed workspace_suspended payload', () => {
    const result = parseSdkErrorDetails({
      error: 'workspace_suspended',
      recoverable: false,
    });
    expect(result).toEqual({
      error: 'workspace_suspended',
      recoverable: false,
    });
  });

  it('parses project_deleted with deletedAt timestamp', () => {
    const result = parseSdkErrorDetails({
      error: 'project_deleted',
      recoverable: false,
      deletedAt: 1747000000000,
    });
    expect(result).toEqual({
      error: 'project_deleted',
      recoverable: false,
      deletedAt: 1747000000000,
    });
  });

  it('parses quota_exceeded with retryAfterSeconds', () => {
    const result = parseSdkErrorDetails({
      error: 'quota_exceeded',
      recoverable: true,
      retryAfterSeconds: 30,
    });
    expect(result).toEqual({
      error: 'quota_exceeded',
      recoverable: true,
      retryAfterSeconds: 30,
    });
  });

  it('returns null for unknown error reason', () => {
    // Including the historical "workspace_deleted" misnomer that
    // operations-followups carried for a week. Belt-and-braces: a
    // server typo here MUST NOT enter the lifecycle as TERMINATED.
    expect(
      parseSdkErrorDetails({ error: 'workspace_deleted', recoverable: false }),
    ).toBe(null);
  });

  it('returns null when recoverable is missing or wrong type', () => {
    expect(parseSdkErrorDetails({ error: 'project_deleted' })).toBe(null);
    expect(
      parseSdkErrorDetails({ error: 'project_deleted', recoverable: 'false' }),
    ).toBe(null);
  });

  it.each([null, undefined, 0, 'string', []])(
    'returns null for non-object input %s',
    (input) => {
      expect(parseSdkErrorDetails(input)).toBe(null);
    },
  );

  it('ignores extra fields without failing', () => {
    const result = parseSdkErrorDetails({
      error: 'project_deleted',
      recoverable: false,
      unexpected: 'value',
      foo: 42,
    });
    expect(result).toEqual({
      error: 'project_deleted',
      recoverable: false,
    });
  });
});
