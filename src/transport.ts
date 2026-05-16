import { parseSdkErrorDetails, type SdkErrorDetails, type SdkErrorReason } from './errors';

export interface CreateIssueResult {
  issueId: string;
  projectKey: string;
  number: number;
}

export class ApiError extends Error {
  // ADR-0003 Decision 9 structured payload, when the server sends one
  // (i.e. for SDK-callables — older endpoints leave this undefined).
  public readonly details: SdkErrorDetails | undefined;

  constructor(
    public status: number,
    message: string,
    details?: SdkErrorDetails,
  ) {
    super(message);
    this.name = 'ApiError';
    this.details = details;
  }

  get sdkErrorReason(): SdkErrorReason | undefined {
    return this.details?.error;
  }
}

/**
 * POST {data: payload} → {result: T}; matches Firebase callable wire
 * format so we can hit createIssueFromSdk without depending on the
 * Firebase JS SDK.
 */
export async function callFunction<T = unknown>(
  endpoint: string,
  fnName: string,
  payload: unknown,
): Promise<T> {
  const url = `${endpoint.replace(/\/$/, '')}/${fnName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: payload }),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    let details: SdkErrorDetails | undefined;
    try {
      // Callable error shape: {"error": {"message", "status", "details": {...}}}
      const body = JSON.parse(text) as {
        error?: { message?: string; details?: unknown };
      };
      if (body?.error?.message) msg = body.error.message;
      const parsed = parseSdkErrorDetails(body?.error?.details);
      if (parsed) details = parsed;
    } catch {
      // body wasn't JSON; keep the HTTP message and leave details unset
    }
    throw new ApiError(res.status, msg, details);
  }
  const body = JSON.parse(text) as { result: T };
  return body.result;
}
