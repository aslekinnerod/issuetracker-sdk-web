import type { SdkErrorReason } from './errors';

/**
 * Strings shown when the SDK has been terminated and a test-cohort
 * user opens the reporting surface. ADR-0003 Decision 9 mandates a
 * localised terminal message; English is the built-in default, and
 * host apps may inject translations via `configure({ terminatedUI })`.
 *
 * Each field is optional — fields the host doesn't override fall back
 * to English. A missing entire object falls back to all-English.
 */
export interface TerminatedUiStrings {
  /** Big headline. Default: "Bug reporting is no longer available." */
  title?: string;
  /** One-line follow-up. Default: "Contact your team." */
  subtitle?: string;
  /** Close-button label. Default: "Close". */
  closeLabel?: string;
}

export interface Runtime {
  apiKey: string;
  endpoint: string;
  // Invoked exactly once, on the OK -> TERMINATED transition. Stored
  // here (rather than in lifecycle state) because it's a configure-
  // time setting that the user owns; the store is the state machine.
  onConfigurationError?: (reason: SdkErrorReason) => void;
  terminatedUI?: TerminatedUiStrings;
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
  /**
   * If `true`, presents a one-time popover on first launch teaching
   * the user which gestures and shortcuts trigger the reporter — only
   * the triggers actually enabled are rendered. Persisted in
   * `localStorage` so the popover never appears twice on the same
   * browser/install, unless the host app calls
   * `Issuetracker.showOnboarding()` explicitly. If no triggers are
   * enabled the popover is silently skipped.
   * Defaults to `false` so existing integrations are unaffected.
   */
  showOnboarding?: boolean;
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
  /**
   * Overrides for the TERMINATED-state UI text. Useful for host apps
   * that ship in non-English locales — the SDK's built-in defaults
   * are English. Any field left undefined falls back to the default.
   */
  terminatedUI?: TerminatedUiStrings;
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
