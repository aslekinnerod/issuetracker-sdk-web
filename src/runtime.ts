export interface Runtime {
  apiKey: string;
  endpoint: string;
}

export interface ConfigureOptions {
  apiKey: string;
  endpoint: string;
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
