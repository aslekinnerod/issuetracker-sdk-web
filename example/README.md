# Issuetracker SDK — Web sample app

A single-page demo of the web SDK that exercises every public
surface so you can shake-test changes in 30 seconds. Same feature
checklist as the Android, iOS, Flutter, and React Native sample
apps — keep them in lockstep when adding capabilities.

This sample is intentionally a **single HTML file**. The web SDK is
designed to drop into any page; a multi-file app would bury that
point under build tooling.

## How to run

1. Drop a `.env.local` file next to this README with your API key
   from the Issuetracker admin UI:

   ```
   VITE_ISSUETRACKER_API_KEY=it_staging_xxxxxxxxxxxxxxxxxxxxxxxx
   ```

   The file is gitignored by Vite default. Skipping it falls back
   to a placeholder that the SDK rejects as `invalid_api_key` —
   useful for demoing the TERMINATED flow.

2. Run the Vite dev server from the SDK root:

   ```
   cd sdk-web
   pnpm install
   pnpm example
   ```

3. Open the printed URL (usually `http://localhost:5173`).

## Feature checklist

Each section in the app maps 1:1 to a surface in the SDK. When you
add a feature, add a section here AND in the sister sample apps so
the five platforms stay comparable.

| Section | What it exercises | SDK API |
|---|---|---|
| **Lifecycle** | Shows the last `onConfigurationError` reason the SDK reported. Has a "Reset" button so you can retry a path that has already fired. | `onConfigurationError` callback on `configure(...)` |
| **Reporting** | One button programmatically opens the reporter. `Cmd/Ctrl + Shift + B`, two-finger long-press (touch), and the floating widget also trigger it. | `Issuetracker.report()` + `enableShortcut` + `longPressToReport` + `showFloatingWidget` |
| **Identity** | Sets / clears the display name that stamps every report. | `identify(name)` / `clearIdentity()` |
| **Breadcrumbs** | Records up to two action breadcrumbs with optional metadata. The most-recent 5 ride along on every report. | `recordAction(name, metadata?)` |
| **TERMINATED-UI i18n** | Toggle a Norwegian translation of the terminal-state strings. Applied immediately — the web SDK accepts a new `terminatedUI` on every `configure(...)` call. | `terminatedUI: TerminatedUiStrings` on `configure(...)` |
| **Destructive** | Crash-test button (with confirmation). The SDK records the crash and queues a report on the next page load. | `Issuetracker.testCrash()` |

The Onboarding section that exists on the four mobile sample apps
is intentionally **absent here** — the web SDK has no first-launch
onboarding popover (gestures don't need teaching when there's a
visible floating button + a keyboard shortcut listed in the UI).

## Folder layout

```
example/
  README.md                  ← you are here
  index.html                 ← the entire demo: markup + inline styles + module script
  .env.local                 ← (gitignored) your API key
```

The companion sample apps mirror this idea per platform convention:

- `sdk-android/sample-app/` (Compose single screen)
- `sdk-flutter/example/` (Material 3 single screen)
- `sdk-react-native/example/` (Pressable cards single screen)
- `sdk-ios/example-app/` (SwiftUI single screen)

Each sample-app README is the same shape (How to run + Feature
checklist table) so a person can hop between platforms and find the
same affordances.

## Adding a new feature

When the SDK gains a new public surface:

1. Add a `<div class="card">` section to `index.html` and wire its
   buttons in the inline `<script type="module">` at the bottom.
2. Add the row to the **Feature checklist** table above.
3. Replicate to the other four sample apps using the same section
   title + same affordance (button label / toggle label).

## What this app intentionally is NOT

- Not a production reference page — uses inline styles + raw DOM
  event listeners, not a framework. The point is to show how
  minimal SDK integration is.
- Not a layout exemplar — single scroll, neutral-grey cards. The
  point is to surface every SDK affordance, not to look pretty.
- Not multi-page — keeps the surface flat so anyone testing the
  SDK can find every feature without learning a navigation tree.

## Web-specific notes

- The example imports from `/src/index.ts` via Vite's dev server, so
  any edit to the SDK sources is hot-reloaded into the demo with no
  publish or build step.
- `localStorage` persists the i18n toggle + last-error display
  across page reloads (since `onConfigurationError` only fires once
  at the transition, we have to remember what fired to keep the
  Lifecycle subtitle meaningful).
- The TERMINATED-UI strings are accepted on every `configure(...)`
  call, so the i18n section re-configures on toggle without a page
  reload (same model as React Native; differs from the mobile-native
  apps where `configure(...)` runs once at process start).
