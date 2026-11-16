# Issuetracker SDK for Web

[![npm](https://img.shields.io/npm/v/@issuetracker/sdk-web.svg)](https://www.npmjs.com/package/@issuetracker/sdk-web)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@issuetracker/sdk-web.svg?label=min%2Bgzip)](https://bundlephobia.com/package/@issuetracker/sdk-web)
[![types](https://img.shields.io/npm/types/@issuetracker/sdk-web.svg)](https://www.npmjs.com/package/@issuetracker/sdk-web)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://www.npmjs.com/package/@issuetracker/sdk-web?activeTab=dependencies)
[![provenance](https://img.shields.io/badge/provenance-attested-success.svg)](https://www.npmjs.com/package/@issuetracker/sdk-web)
[![license](https://img.shields.io/npm/l/@issuetracker/sdk-web.svg)](LICENSE)

Drop-in issue reporter for web apps. Capture a screenshot, annotate it,
and file an issue directly into a pre-configured Issuetracker project.

## Install

```bash
npm install @issuetracker/sdk-web
```

Or via CDN (pin to a semver range so you get patches but not breaking
changes):

```html
<script src="https://cdn.jsdelivr.net/npm/@issuetracker/sdk-web@^0.5"></script>
```

## Quickstart

```ts
import { Issuetracker } from '@issuetracker/sdk-web';

Issuetracker.configure({ apiKey: 'it_...' });
```

Default reporter shortcut: **Ctrl/Cmd + Alt + R** — remap it or turn it
off via `enableShortcut` (`false`, or a descriptor such as
`{ code: 'KeyB', shiftKey: true }`; `code` is a physical-key
`KeyboardEvent.code` value, so the combo is keyboard-layout
independent). Widget-visibility toggle: **Ctrl/Cmd + Alt + T**. The
floating widget is hidden by default — enable with
`showFloatingWidget: true`.

### Light and dark mode

All SDK UI — the report dialog, screenshot editor, onboarding popover
and floating button — renders light or dark via the `theme` option:

```ts
Issuetracker.configure({ apiKey: 'it_...', theme: 'auto' }); // 'auto' | 'light' | 'dark'
```

`'auto'` (the default) follows your page. An explicit signal on
`<html>` wins: `data-theme`, `data-bs-theme`, `data-color-scheme` or
`data-mode` set to `dark`/`light`; a `dark` or `light` class (e.g.
Tailwind's `darkMode: 'class'`); or a computed `color-scheme` of just
`dark` or `light`. Without one, the OS `prefers-color-scheme` decides.
While SDK UI is on screen it re-themes live when the OS preference or
those `<html>` attributes change. `'light'` and `'dark'` pin the mode.
Both themes meet WCAG AA contrast.

## Assigning reports (testers only)

When the install holds a tester token
(`Issuetracker.setTesterToken(token, expiresAt)`), the report form shows
an optional **Assign to** picker listing the project's members by
display name, preselected with the project's SDK triage default. The
list is fetched lazily when the form opens. Without a tester token the
SDK makes no request and shows no picker — end users of your app never
see who is on your team. The server only honours an assignee from a
valid tester naming a current project member; anything else falls back
to the triage default.

## Full documentation

API reference, triggers, TERMINATED behavior, crash reporting, identity
flow, breadcrumbs, and troubleshooting — see
**[docs.issuetracker.no/sdk/web](https://docs.issuetracker.no/sdk/web)**.

## Requirements

All evergreen browsers (Chrome / Safari / Firefox / Edge, last 2 versions).

## Versioning

Semver. Pre-1.0 the minor bumps for breaking changes; the patch for
bug fixes and additive features. Pin to `^0.5` to stay on a known
compatible line.

## Upgrading

The SDK is entirely client-side — upgrading never requires changes to
your API key, `configure()` options, triggers, or any backend. Bump the
version and redeploy your app.

**npm**

- If your range already allows the new version (e.g. `^0.5.x`), run
  `npm update @issuetracker/sdk-web` (or `pnpm up` / `yarn up`) to move
  your lockfile forward — a plain `npm install` won't bump an
  already-locked version.
- If you pinned an exact version or installed from a git URL, change the
  dependency to `^0.5.9` and reinstall.

Then rebuild and redeploy — the fix ships in your client bundle.

**CDN**

- `@^0.5` or `@latest` URLs pick up new patches automatically (edge
  caches may take a few hours; a cache purge forces it).
- Exact-pinned URLs (`@0.5.7`) must be changed to the new version.

If you added a manual `html2canvas` install/import in earlier versions
to work around screenshots failing, you can remove it — 0.5.8 onward
bundles `html2canvas` itself. See the [CHANGELOG](CHANGELOG.md) for the
full history of fixes and per-version notes.

## Releasing (maintainers)

1. Bump `version` in `package.json`.
2. Commit: `release: x.y.z`.
3. Tag and push: `git tag x.y.z && git push --tags`.

The `publish.yml` workflow verifies the tag matches `package.json`,
runs typecheck + tests + build, then publishes to npm with provenance
via GitHub OIDC.

## License

MIT
