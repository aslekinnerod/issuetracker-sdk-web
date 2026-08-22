# Changelog

All notable changes to `@issuetracker/sdk-web` are documented here.
This project follows [Semantic Versioning](https://semver.org/) and the
format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Changed

- **Reporter keyboard shortcut remapped: Cmd/Ctrl + Alt + R** (was
  Cmd/Ctrl + Shift + B, which collides with the browser's
  bookmarks-bar toggle — our `preventDefault()` broke that browser
  feature on host pages). `enableShortcut` now also accepts a
  descriptor `{ code, altKey?, shiftKey? }` to remap the combo
  (Cmd/Ctrl is always required), in addition to `true` (default
  combo) and `false` (no listener installed). `code` is a
  `KeyboardEvent.code` physical-key value (`KeyR`, ...) so combos are
  keyboard-layout independent. The onboarding popover derives the
  combo it displays from the effective config, so a remap shows up
  there automatically. New exported type: `ShortcutConfig`.

### Added

- Tester-gated reporting (ADR-0005). The SDK now fetches remote config
  from `/v1/getSdkConfig` at `configure()` (cached in `localStorage`,
  refreshed in the background). When the project is in testers-only
  mode, the gesture triggers (keyboard shortcut, two-finger long-press,
  floating widget) are silently inert unless a valid tester token is
  present. Fail-mode with no cache: prod-prefixed keys fail closed,
  dev/staging keys fail open.
- `Issuetracker.setTesterToken(token, expiresAt?)` and
  `Issuetracker.clearTesterToken()`. Web has no companion-app
  transport, so the token is handed over programmatically; when
  present it is attached to every report and stamps the tester's
  identity server-side, in open mode too.
- New wire error reasons `tester_attestation_required` and
  `tester_token_invalid`. Both are non-recoverable but NOT terminal:
  the SDK shows an inline message in the report form, drops a stale
  token, re-pulls config, and never transitions to TERMINATED on them.
  A terminal reason on the config fetch itself (revoked key, deleted
  project) does terminate, same as on submission.

## [0.5.13] - 2026-05-31

### Added

- Badge row at the top of the README (npm version, bundle size, types,
  zero dependencies, provenance, license).
- This `CHANGELOG.md`, backfilled for 0.5.6 onward and now shipped with
  the published package.

No code changes.

## [0.5.12] - 2026-05-31

### Fixed

- Screenshots of pages with a `<video>` hero no longer push in-flow
  content below the video down. `html2canvas` mis-sizes `<video>`
  elements and ignores `overflow: hidden` clipping on their container,
  so an absolutely-positioned `object-fit: cover` hero would overflow
  its section in the render. The SDK now swaps each `<video>` for a
  placeholder that copies its box geometry (and the `poster` as a
  background) before capturing, then restores it.

## [0.5.11] - 2026-05-29

### Fixed

- Screenshots on pages whose `<body>` has `overflow != visible` (e.g.
  the common `overflow-x: hidden`, which computes to `overflow: hidden
  auto`) no longer capture the top of the page when the user has
  scrolled. `html2canvas` was double-applying the current scroll offset
  on such pages; the SDK now pins its scroll options to 0, producing a
  deterministic document-coordinate render that is cropped with the
  live scroll offset.

## [0.5.10] - 2026-05-29

### Changed

- An overflow-toggle workaround for the scrolled-screenshot issue —
  empirically ineffective. Superseded by 0.5.11, which is the real fix.
  No reason to stop at 0.5.10; upgrade straight to 0.5.11 or later.

## [0.5.9] - 2026-05-28

### Fixed

- Screenshots now capture the scrolled viewport instead of always
  rendering the top of the page. The previous implementation relied on
  `html2canvas`'s fragile `x`/`y`/`width`/`height` crop options; the
  SDK now renders the full page and crops with `drawImage` using the
  live scroll offset.

## [0.5.8] - 2026-05-28

### Changed

- `html2canvas` is now bundled into the SDK's own dist. Previously it
  was an external `dependency` resolved by the consumer's bundler,
  which silently failed in some setups (certain Vite SSR /
  `optimizeDeps` configurations, native ESM without import maps). The
  dynamic import still code-splits it into a lazy-loaded chunk, so the
  ~140 KB only downloads when a user actually triggers a report.

### Removed

- `html2canvas` from `dependencies` (it is now build-time only). If you
  added a manual `html2canvas` install or import to work around the
  resolution issue, you can remove it.

## [0.5.7] - 2026-05-28

### Changed

- Published via npm Trusted Publishing (OIDC) with SLSA provenance
  attestation. No functional changes.

## [0.5.6] - 2026-05-27

### Added

- First release published to npm as `@issuetracker/sdk-web`. Previously
  available only via GitHub git URL.
