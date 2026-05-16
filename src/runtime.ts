import type { SdkErrorReason } from './errors';

export interface Runtime {
  apiKey: string;
  endpoint: string;
  // Invoked exactly once, on the OK -> TERMINATED transition. Stored
  // here (rather than in lifecycle state) because it's a configure-
  // time setting that the user owns; the store is the state machine.
  onConfigurationError?: (reason: SdkErrorReason) => void;
}

// Routing is derived from the key prefix so integrators never see
// any URL — they just paste the key the web UI gave them.
//   it_dev_*      → dev backend (internal use only)
//   it_staging_*  → staging backend
//   it_*          → production (brand-domain)
export function resolveEndpoint(apiKey: string): string {
  if (apiKey.startsWith('it_dev_')) {
    return 'https://issuetracker-api-dev.web.app/v1';
  }
  if (apiKey.startsWith('it_staging_')) {
    return 'https://issuetracker-api-staging.web.app/v1';
  }
  return 'https://api.issuetracker.no/v1';
}

export interface ConfigureOptions {
  apiKey: string;
  /** Cmd/Ctrl + Shift + B keyboard shortcut. Web-only. */
  enableShortcut?: boolean;
  /**
   * Two-finger long-press for 3 seconds. Touch devices / PWAs.
   * Same name as the native iOS + Android SDKs use, so cross-platform
   * configs map cleanly.
   */
  longPressToReport?: boolean;
  /** Floating button in the bottom-right corner. Web-only. */
  showFloatingWidget?: boolean;
  enableCrashReporting?: boolean;
  /**
   * Optional callback invoked once when the SDK transitions to the
   * terminated state because the server signalled a non-recoverable
   * failure (project deleted, API key revoked, workspace suspended,
   * etc. — see {@link SdkErrorReason}). Default behaviour is silent
   * in production; host apps may forward this to their own telemetry.
   * Once invoked, the SDK will not call the report endpoint again for
   * the lifetime of this install — recovery requires a fresh
   * `configure()` (typically a page reload). See ADR-0003 Decision 9.
   */
  onConfigurationError?: (reason: SdkErrorReason) => void;
}

export type IssueReportType = 'bug' | 'task' | 'story';

export interface Breadcrumb {
  timestamp: number;
  action: string;
  metadata?: Record<string, string>;
}

export interface CrashReport {
  detectedAt: number;
  exceptionName?: string;
  exceptionReason?: string;
}

export const ISSUE_REPORT_TYPES: { value: IssueReportType; label: string }[] = [
  { value: 'bug', label: 'Bug' },
  { value: 'task', label: 'Task' },
  { value: 'story', label: 'Story' },
];
