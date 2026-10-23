import { ApiError } from '../transport';

// Server error messages on createIssueFromSdk are written for the host
// app's developers (raw zod issues, "monthly SDK issue quota exceeded
// for this workspace") — never show them to the person filing the
// report. Map to a short human line here; the raw message still goes
// to the console so integrators can debug.
//
// Tester-gating and terminal reasons are handled before this by the
// reporter and never reach it.
export function submitErrorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) {
    // fetch() itself failed: offline, DNS, CORS preflight.
    return "Couldn't reach the server. Check your connection and try again.";
  }
  if (e.details?.error === 'quota_exceeded') {
    return "This app can't accept more reports right now. Please try again later.";
  }
  if (e.details?.error === 'transient' || e.status >= 500) {
    return 'Something went wrong on our side. Please try again.';
  }
  return "Your report couldn't be sent. Please try again.";
}
