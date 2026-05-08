export interface CreateIssueResult {
  issueId: string;
  projectKey: string;
  number: number;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
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
    try {
      const body = JSON.parse(text) as { error?: { message?: string } };
      if (body?.error?.message) msg = body.error.message;
    } catch {
      // body wasn't JSON; keep the HTTP message
    }
    throw new ApiError(res.status, msg);
  }
  const body = JSON.parse(text) as { result: T };
  return body.result;
}
