import { resolveEndpoint, type ConfigureOptions, type Runtime } from './runtime';
import { setName, clearName } from './identity';
import { recordBreadcrumb } from './breadcrumbs';
import { installCrashHandlers, sendPendingCrashIfAny } from './crash';
import { installLifecycle } from './lifecycle';
import { installShortcut } from './triggers/shortcut';
import { installLongPress } from './triggers/long-press';
import { installFloatingWidget } from './triggers/widget';
import { openReporter } from './ui/reporter';

let runtime: Runtime | null = null;

type Defaults = Required<Omit<ConfigureOptions, 'onConfigurationError'>> &
  Pick<ConfigureOptions, 'onConfigurationError'>;

function applyDefaults(opts: ConfigureOptions): Defaults {
  return {
    apiKey: opts.apiKey,
    enableShortcut: opts.enableShortcut ?? true,
    longPressToReport: opts.longPressToReport ?? true,
    showFloatingWidget: opts.showFloatingWidget ?? true,
    enableCrashReporting: opts.enableCrashReporting ?? true,
    onConfigurationError: opts.onConfigurationError,
  };
}

/**
 * Public facade. Apps integrate by calling configure() once at app
 * boot; everything else is driven by the configured triggers plus the
 * programmatic report() call.
 */
export const Issuetracker = {
  configure(options: ConfigureOptions): void {
    const opts = applyDefaults(options);
    if (!opts.apiKey) {
      // eslint-disable-next-line no-console
      console.warn('[Issuetracker] configure() requires apiKey');
      return;
    }
    runtime = {
      apiKey: opts.apiKey,
      endpoint: resolveEndpoint(opts.apiKey),
      onConfigurationError: opts.onConfigurationError,
    };
    // Rehydrate any prior TERMINATED state from localStorage before
    // wiring triggers, so the pre-flight gate in openReporter() is
    // authoritative immediately after configure() returns.
    installLifecycle();
    if (opts.enableCrashReporting) {
      // Fire any pending crash from the previous session BEFORE
      // installing the new handler — avoids racing with a fresh error
      // overwriting the marker we're about to send.
      void sendPendingCrashIfAny(runtime);
      installCrashHandlers();
    }
    if (opts.enableShortcut) installShortcut(() => Issuetracker.report());
    if (opts.longPressToReport) installLongPress(() => Issuetracker.report());
    if (opts.showFloatingWidget) installFloatingWidget(() => Issuetracker.report());
  },

  /** Programmatic trigger — useful for in-app "report a bug" buttons. */
  report(): void {
    if (!runtime) {
      // eslint-disable-next-line no-console
      console.warn('[Issuetracker] report() called before configure()');
      return;
    }
    void openReporter(runtime);
  },

  /** Skip the "What should we call you?" prompt. Safe pre-configure. */
  identify(name: string): void {
    setName(name);
  },

  clearIdentity(): void {
    clearName();
  },

  /** Record a single user action (keeps the most recent 5). Pre-configure-safe. */
  recordAction(action: string, metadata?: Record<string, string>): void {
    recordBreadcrumb(action, metadata);
  },

  /** Throws an error for testing the crash auto-report flow. */
  testCrash(): never {
    throw new Error('Issuetracker.testCrash() triggered');
  },
};

export type { ConfigureOptions, IssueReportType } from './runtime';
export type { SdkErrorReason } from './errors';
