# Issuetracker SDK for Web

Drop-in issue reporter for web apps. Capture a screenshot, annotate it, and file an issue directly into a pre-configured Issuetracker project.

## Install

```bash
npm install @issuetracker/sdk-web
# or
pnpm add @issuetracker/sdk-web
```

Or via script tag:

```html
<script src="https://unpkg.com/@issuetracker/sdk-web"></script>
```

## Usage

```ts
import { Issuetracker } from '@issuetracker/sdk-web';

Issuetracker.configure({
  apiKey: 'it_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
});
```

That's it. Triggers (all enabled by default, all configurable):

| Environment | Trigger |
| --- | --- |
| Desktop | `Cmd/Ctrl + Shift + B` |
| Mobile / PWA | Two-finger long-press for 3 seconds |
| Universal | Floating button in the corner |
| Programmatic | `Issuetracker.report()` |

The SDK talks to Issuetracker's hosted backend — there is no endpoint to configure. Staging-prefixed keys (`it_staging_…`) are routed to the staging environment automatically; everything else hits production.

## First-run onboarding (optional)

Opt-in popover shown on first launch that teaches the user which triggers open the reporter:

```ts
Issuetracker.configure({
  apiKey: 'it_xxx…',
  showOnboarding: true,
});
```

Shown once per install (persisted in `localStorage`). Only renders tiles for triggers that are actually enabled — disable `longPressToReport` / `enableShortcut` / `showFloatingWidget` and that tile drops out. If none are enabled, the popover is skipped entirely.

Re-present from your own settings UI ("Show introduction again"):

```ts
Issuetracker.showOnboarding();
```

## Manual trigger

```ts
document.querySelector('#report-bug').addEventListener('click', () => {
  Issuetracker.report();
});
```

## Identify the reporter

```ts
Issuetracker.identify('Alice Andersen');
```

## Breadcrumbs

```ts
Issuetracker.recordAction('login_tapped');
Issuetracker.recordAction('viewed_product', { sku: 'abc-123' });
```

## Configuration

```ts
Issuetracker.configure({
  apiKey: '...',
  enableShortcut: true,            // Cmd/Ctrl+Shift+B
  enableLongPress: true,           // 2-finger 3s
  showFloatingWidget: true,
  enableCrashReporting: true,      // window.onerror + unhandledrejection
});
```

## Browser support

Modern evergreen browsers (Chrome 90+, Safari 14+, Firefox 90+, Edge 90+).

Screenshot capture uses [html2canvas](https://html2canvas.hertzen.com/), which has known limitations with cross-origin images, video frames, and some SVG features. The annotation editor and the issue submission work regardless.

## License

MIT
