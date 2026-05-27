# Issuetracker SDK for Web

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

Default trigger: **Ctrl/Cmd + Alt + T**. The floating widget is hidden by
default — enable with `showFloatingWidget: true`.

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

## Releasing (maintainers)

1. Bump `version` in `package.json`.
2. Commit: `release: x.y.z`.
3. Tag and push: `git tag x.y.z && git push --tags`.

The `publish.yml` workflow verifies the tag matches `package.json`,
runs typecheck + tests + build, then publishes to npm with provenance
via GitHub OIDC.

## License

MIT
