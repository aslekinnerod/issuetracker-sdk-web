# Changelog

All notable changes to `@issuetracker/sdk-web` are documented here.
This project follows [Semantic Versioning](https://semver.org/) and the
format is based on [Keep a Changelog](https://keepachangelog.com/).

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
