import { describe, expect, it } from 'vitest';
import { ApiError } from '../transport';
import { submitErrorMessage } from './submitError';

describe('submitErrorMessage', () => {
  it('never shows a raw server validation message', () => {
    const e = new ApiError(400, 'Array must contain at most 5 element(s)');
    expect(submitErrorMessage(e)).not.toContain('Array');
    expect(submitErrorMessage(e)).toBe("Your report couldn't be sent. Please try again.");
  });

  it('reports a network failure as a connection problem', () => {
    expect(submitErrorMessage(new TypeError('Failed to fetch'))).toMatch(/connection/);
  });

  it('maps quota_exceeded', () => {
    const e = new ApiError(429, 'monthly SDK issue quota exceeded for this workspace', {
      error: 'quota_exceeded',
      recoverable: true,
    });
    expect(submitErrorMessage(e)).toMatch(/can't accept more reports/);
  });

  it('maps transient and bare 5xx to a server-side message', () => {
    const transient = new ApiError(503, 'project deletion is in progress', {
      error: 'transient',
      recoverable: true,
    });
    expect(submitErrorMessage(transient)).toMatch(/on our side/);
    expect(submitErrorMessage(new ApiError(500, 'INTERNAL'))).toMatch(/on our side/);
  });
});
