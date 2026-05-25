# Issuetracker SDK for Web

Drop-in issue reporter for web apps. Capture a screenshot, annotate it,
and file an issue directly into a pre-configured Issuetracker project.

## Install

```bash
npm install @issuetracker/sdk-web
```

Or via CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/@issuetracker/sdk-web"></script>
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

## License

MIT
