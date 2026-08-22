import {
  resolveEndpoint,
  type ConfigureOptions,
  type Runtime,
  type ShortcutConfig,
} from './runtime';
import {
  canTriggerReport,
  clearTesterToken,
  installAttestation,
  setTesterToken,
} from './attestation';
import { setName, clearName } from './identity';
import { recordBreadcrumb } from './breadcrumbs';
import { installCrashHandlers, sendPendingCrashIfAny } from './crash';
import { installLifecycle } from './lifecycle';
import { disableShortcut, installShortcut, resolveShortcutConfig } from './triggers/shortcut';
import { installLongPress } from './triggers/long-press';
import { installFloatingWidget } from './triggers/widget';
import { presentOnboardingIfNeeded, presentOnboardingForced } from './onboarding';
import { openReporter } from './ui/reporter';

let runtime: Runtime | null = null;
let enabledTriggers: {
  longPressEnabled: boolean;
  /** Effective shortcut combo, or `false` when the shortcut is off. */
  shortcut: Required<ShortcutConfig> | false;
  enableFloatingWidget: boolean;
} = {
  longPressEnabled: false,
  shortcut: false,
  enableFloatingWidget: false,
};

type Defaults = Required<Omit<ConfigureOptions, 'onConfigurationError' | 'terminatedUI'>> &
  Pick<ConfigureOptions, 'onConfigurationError' | 'terminatedUI'>;

function applyDefaults(opts: ConfigureOptions): Defaults {
  return {
    apiKey: opts.apiKey,
    showOnboarding: opts.showOnboarding ?? false,
    enableShortcut: opts.enableShortcut ?? true,
    longPressToReport: opts.longPressToReport ?? true,
    showFloatingWidget: opts.showFloatingWidget ?? true,
    enableCrashReporting: opts.enableCrashReporting ?? true,
    onConfigurationError: opts.onConfigurationError,
    terminatedUI: opts.terminatedUI,
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
      terminatedUI: opts.terminatedUI,
    };
    // Rehydrate any prior TERMINATED state from localStorage before
    // wiring triggers, so the pre-flight gate in openReporter() is
    // authoritative immediately after configure() returns.
    installLifecycle();
    // Seed remote config (testers-only gating, ADR-0005) from cache and
    // refresh it in the background. Must come before triggers install
    // so the very first gesture consults real data when we have any.
    installAttestation(runtime);
    if (opts.enableCrashReporting) {
      // Fire any pending crash from the previous session BEFORE
      // installing the new handler — avoids racing with a fresh error
      // overwriting the marker we're about to send.
      void sendPendingCrashIfAny(runtime);
      installCrashHandlers();
    }
    // Gesture triggers are gated per-fire rather than at install time:
    // config can flip while the page is open, and a listener that
    // checks at fire-time reconciles instantly with no uninstall
    // plumbing. In testers-only mode without a token the gestures are
    // silently inert (ADR-0005 invariant 5). The programmatic
    // report() below is deliberately ungated — a host app's own
    // button should surface the attestation message instead.
    const gatedTrigger = () => {
      if (canTriggerReport()) Issuetracker.report();
    };
    // `false` disables the shortcut entirely; `true` (the default)
    // means the default combo; a descriptor remaps it.
    const shortcut = resolveShortcutConfig(opts.enableShortcut);
    if (shortcut) installShortcut(gatedTrigger, shortcut);
    else disableShortcut();
    if (opts.longPressToReport) installLongPress(gatedTrigger);
    if (opts.showFloatingWidget) installFloatingWidget(gatedTrigger);
    // Capture the enabled-triggers snapshot for the onboarding view
    // and any later showOnboarding() call, so a single source of
    // truth governs both runtime behaviour and onboarding content —
    // the onboarding tile displays exactly the combo the listener
    // matches on.
    enabledTriggers = {
      longPressEnabled: opts.longPressToReport,
      shortcut,
      enableFloatingWidget: opts.showFloatingWidget,
    };
    if (opts.showOnboarding) {
      // Defer to the next tick so the host app's own render pass
      // finishes mounting before we attach the popover host element.
      setTimeout(() => {
        // Never advertise gestures that are gated off for this
        // install (testers-only mode without attestation).
        if (!canTriggerReport()) return;
        presentOnboardingIfNeeded({
          shakeEnabled: false, // web has no shake — accelerometer
                               // access in browsers is gated behind
                               // permission prompts not worth the UX
                               // cost for a bug-reporter
          longPressEnabled: enabledTriggers.longPressEnabled,
          shortcut: enabledTriggers.shortcut,
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
      shortcut: enabledTriggers.shortcut,
      enableFloatingWidget: enabledTriggers.enableFloatingWidget,
    });
  },

  /** Skip the "What should we call you?" prompt. Safe pre-configure. */
  identify(name: string): void {
    setName(name);
  },

  /**
   * Store a tester attestation token (ADR-0005). On projects in
   * testers-only mode this is what unlocks the report triggers and
   * gets reports past ingest; in open mode it stamps reports with the
   * tester's identity. Web has no companion-app transport, so the
   * token is handed over programmatically — from the host app's own
   * integration or, later, a browser extension. Safe pre-configure.
   */
  setTesterToken(token: string, expiresAt?: number): void {
    setTesterToken(token, expiresAt);
  },

  /** Remove the stored tester token. Safe pre-configure. */
  clearTesterToken(): void {
    clearTesterToken();
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

export type {
  ConfigureOptions,
  IssueReportType,
  ShortcutConfig,
  TerminatedUiStrings,
} from './runtime';
export type { SdkErrorReason } from './errors';
