import { resolveEndpoint, type ConfigureOptions, type Runtime } from './runtime';
import { setName, clearName } from './identity';
import { recordBreadcrumb } from './breadcrumbs';
import { installCrashHandlers, sendPendingCrashIfAny } from './crash';
import { installLifecycle } from './lifecycle';
import { installShortcut } from './triggers/shortcut';
import { installLongPress } from './triggers/long-press';
import { installFloatingWidget } from './triggers/widget';
import { presentOnboardingIfNeeded, presentOnboardingForced } from './onboarding';
import { openReporter } from './ui/reporter';

let runtime: Runtime | null = null;
let enabledTriggers = {
  longPressEnabled: false,
  enableShortcut: false,
  enableFloatingWidget: false,
};

type Defaults = Required<Omit<ConfigureOptions, 'onConfigurationError'>> &
  Pick<ConfigureOptions, 'onConfigurationError'>;

function applyDefaults(opts: ConfigureOptions): Defaults {
  return {
    apiKey: opts.apiKey,
    showOnboarding: opts.showOnboarding ?? false,
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
    // Capture the enabled-triggers snapshot for the onboarding view
    // and any later showOnboarding() call, so a single source of
    // truth governs both runtime behaviour and onboarding content.
    enabledTriggers = {
      longPressEnabled: opts.longPressToReport,
      enableShortcut: opts.enableShortcut,
      enableFloatingWidget: opts.showFloatingWidget,
    };
    if (opts.showOnboarding) {
      // Defer to the next tick so the host app's own render pass
      // finishes mounting before we attach the popover host element.
      setTimeout(() => {
        presentOnboardingIfNeeded({
          shakeEnabled: false, // web has no shake — accelerometer
                               // access in browsers is gated behind
                               // permission prompts not worth the UX
                               // cost for a bug-reporter
          longPressEnabled: enabledTriggers.longPressEnabled,
          enableShortcut: enabledTriggers.enableShortcut,
          enableFloatingWidget: enabledTriggers.enableFloatingWidget,
        });
      }, 0);
    }
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

  /**
   * Re-presents the onboarding popover regardless of whether it has
   * been shown before on this install. Intended for a "Show
   * introduction again"-style entry in the host app's own settings
   * screen. Calling this with no triggers enabled is a no-op.
   * Must be called after `configure(...)`.
   */
  showOnboarding(): void {
    if (!runtime) {
      // eslint-disable-next-line no-console
      console.warn('[Issuetracker] showOnboarding() called before configure()');
      return;
    }
    presentOnboardingForced({
      shakeEnabled: false,
      longPressEnabled: enabledTriggers.longPressEnabled,
      enableShortcut: enabledTriggers.enableShortcut,
      enableFloatingWidget: enabledTriggers.enableFloatingWidget,
    });
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
