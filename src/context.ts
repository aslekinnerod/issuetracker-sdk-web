/**
 * Collect non-PII web environment metadata. Maps to the same
 * SdkContext fields the iOS/Android SDKs send so the server doesn't
 * need to branch on platform when triaging.
 */
export function collectContext(): Record<string, string> {
  const out: Record<string, string> = { platform: 'Web' };
  if (typeof navigator !== 'undefined') {
    if (navigator.language) out.locale = navigator.language;
    // No clean osVersion on web — userAgent is the closest signal.
    out.osVersion = navigator.userAgent;
  }
  if (typeof Intl !== 'undefined') {
    try {
      out.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      /* timezone unavailable */
    }
  }
  if (typeof window !== 'undefined') {
    // appBundleId is repurposed to host (origin without scheme) so
    // server-side filtering works the same way as on mobile.
    out.appBundleId = window.location.host;
    out.appVersion = window.location.pathname || '/';
  }
  return out;
}
