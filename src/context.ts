/**
 * Collect non-PII web environment metadata. Maps to the same
 * SdkContext fields the iOS/Android SDKs send so the server doesn't
 * need to branch on platform when triaging.
 *
 * Server-side schema caps each field at 32–64 chars; this collector
 * truncates aggressively so a long user-agent or SPA pathname can
 * never reject the whole report. The first 64 chars of a UA still
 * carry the OS + major browser, which is what triagers actually use.
 */
export function collectContext(): Record<string, string> {
  const out: Record<string, string> = { platform: 'Web' };
  if (typeof navigator !== 'undefined') {
    if (navigator.language) out.locale = navigator.language.slice(0, 32);
    // No clean osVersion on web — userAgent is the closest signal,
    // but it's typically 100–200 chars; truncate to fit the schema.
    out.osVersion = navigator.userAgent.slice(0, 64);
  }
  if (typeof Intl !== 'undefined') {
    try {
      out.timeZone = Intl.DateTimeFormat()
        .resolvedOptions()
        .timeZone.slice(0, 64);
    } catch {
      /* timezone unavailable */
    }
  }
  if (typeof window !== 'undefined') {
    // appBundleId is repurposed to host (origin without scheme) so
    // server-side filtering works the same way as on mobile.
    out.appBundleId = window.location.host.slice(0, 256);
    // SPA pathnames can be arbitrarily deep; truncate to fit.
    out.appVersion = (window.location.pathname || '/').slice(0, 64);
  }
  return out;
}
