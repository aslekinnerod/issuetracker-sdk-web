import type { Runtime } from './runtime';
import { ApiError, callFunction } from './transport';
import { clearTesterToken, getTesterToken, setTesterToken } from './attestation';
import { isLifecycleTerminated } from './lifecycle';

/**
 * "Assign to" picker data (ITD-266).
 *
 * Tester-only by design: the team's names are personal data, and an
 * ordinary end user of the host app must never see them. So this module
 * makes NO request unless the install holds a tester token (ADR-0005),
 * and the server answers `listSdkAssignees` only to a valid one. Every
 * failure — offline, rejected token, dead binding — reads as "no
 * picker": the report form works exactly as it does for everyone else.
 */

export interface Assignee {
  userId: string;
  displayName: string;
}

export interface AssigneeOptions {
  assignees: Assignee[];
  /** The project's SDK triage default, preselected in the picker. */
  defaultAssigneeId: string | null;
}

interface ListSdkAssigneesResult {
  assignees?: unknown;
  defaultAssigneeId?: unknown;
  testerTokenExpiresAt?: unknown;
}

function parseAssignees(raw: unknown): Assignee[] {
  if (!Array.isArray(raw)) return [];
  const out: Assignee[] = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue;
    const { userId, displayName } = a as Record<string, unknown>;
    if (typeof userId !== 'string' || userId.length === 0) continue;
    if (typeof displayName !== 'string' || displayName.length === 0) continue;
    // Copy only the two fields — never keep anything else the server sent.
    out.push({ userId, displayName });
  }
  return out;
}

/**
 * Fetch the picker's options, or null when the picker must not show.
 * Called lazily when the report form opens — never at configure().
 */
export async function fetchAssigneeOptions(rt: Runtime): Promise<AssigneeOptions | null> {
  if (isLifecycleTerminated()) return null;
  const testerToken = getTesterToken();
  if (!testerToken) return null;
  try {
    const result = await callFunction<ListSdkAssigneesResult>(rt.endpoint, 'listSdkAssignees', {
      apiKey: rt.apiKey,
      testerToken,
    });
    if (typeof result?.testerTokenExpiresAt === 'number') {
      // Renew-on-use (ADR-0005 Decision 10): adopt the pushed-out expiry.
      setTesterToken(testerToken, result.testerTokenExpiresAt);
    }
    const assignees = parseAssignees(result?.assignees);
    if (assignees.length === 0) return null;
    const def = result?.defaultAssigneeId;
    const defaultAssigneeId =
      typeof def === 'string' && assignees.some((a) => a.userId === def) ? def : null;
    return { assignees, defaultAssigneeId };
  } catch (e) {
    // The server has positively rejected this token; drop it, as the
    // submit path does. Everything else — including terminal reasons —
    // is left to the submit path, which owns the lifecycle dispatch.
    if (e instanceof ApiError && e.details?.error === 'tester_token_invalid') {
      clearTesterToken();
    }
    return null;
  }
}
