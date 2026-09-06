#!/usr/bin/env node
//
// Verify the tarball npm would actually publish.
//
// Why this exists: `dist/` is gitignored and `prepare` (= tsup, with
// `clean: true`) re-runs on `npm publish`, so the artifact that ships is
// a *different build* from the one `pnpm test` ran against. Nothing else
// in the pipeline looks at it. A tsup entry/format/config change that
// drops or renames an entry point publishes green and breaks every
// consumer at install time.
//
// This asserts the shipped file list against what package.json promises:
//   - every path named in main / module / types / unpkg / exports
//   - the content-hashed lazy chunk the ESM build code-splits out
//     (src/screenshot.ts does `await import('html2canvas-pro')`, and
//     tsup.config.ts `noExternal` inlines it into a local chunk)
//   - that dist/index.js does NOT contain a bare `html2canvas-pro`
//     specifier — that is the exact signature of `noExternal` having
//     been dropped, which shipped once already and silently broke
//     screenshots for every consumer.
//
// Run from the package root. Exits non-zero with the missing paths.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/** Collect every dist path package.json points at, from any field shape. */
function declaredPaths(value, out = new Set()) {
  if (typeof value === 'string') {
    if (value.startsWith('./dist/')) out.add(value.slice(2));
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) declaredPaths(v, out);
  }
  return out;
}

const expected = new Set([
  ...declaredPaths(pkg.main),
  ...declaredPaths(pkg.module),
  ...declaredPaths(pkg.types),
  ...declaredPaths(pkg.unpkg),
  ...declaredPaths(pkg.exports),
]);

if (expected.size === 0) {
  console.error('verify-package: package.json declares no ./dist/* entry points — refusing to pass.');
  process.exit(1);
}

// `npm pack --dry-run` runs the real `prepare` build and reports the exact
// file list that would be published — but tsup writes its build log to the
// same stream, so the output is a banner followed by the JSON. Two things
// that look like they would fix that do not: `--ignore-scripts` does not
// stop `prepare` here, and taking the first `[` lands inside tsup's ANSI
// colour escape (`\x1b[34mCLI`), which is what made this script die at
// position 3 and turn CI red.
//
// npm prints the array with its opening bracket alone on a line, so that
// is the boundary to cut on — no guessing, and it still fails loudly if
// the format ever changes.
const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});
const start = raw.search(/^\[$/m);
if (start === -1) {
  console.error('verify-package: could not find the JSON report in `npm pack` output.');
  console.error(raw.slice(-2000));
  process.exit(1);
}
let report;
try {
  report = JSON.parse(raw.slice(start));
} catch (err) {
  console.error('verify-package: could not parse `npm pack --dry-run --json` output.');
  console.error(String(err));
  console.error(raw.slice(start, start + 2000));
  process.exit(1);
}
const shipped = new Set(report[0].files.map((f) => f.path));

const missing = [...expected].filter((p) => !shipped.has(p));

// The lazy screenshot chunk is content-hashed, so match by shape.
const CHUNK_RE = /^dist\/html2canvas-pro\.esm-[A-Za-z0-9_-]+\.js$/;
const hasChunk = [...shipped].some((p) => CHUNK_RE.test(p));
if (!hasChunk) {
  missing.push('dist/html2canvas-pro.esm-<hash>.js (lazy screenshot chunk)');
}

// A bare specifier here means `noExternal` was dropped and consumers are
// expected to resolve html2canvas-pro themselves — which they cannot,
// because it is a devDependency of this package only.
const esm = readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8');
const bareSpecifier = /(?:import|require)\(\s*["']html2canvas-pro["']\s*\)/.test(esm);

if (missing.length > 0 || bareSpecifier) {
  console.error('\nverify-package: the tarball npm would publish does not match package.json.\n');
  for (const p of missing) console.error(`  missing: ${p}`);
  if (bareSpecifier) {
    console.error('  dist/index.js contains a bare "html2canvas-pro" import — tsup `noExternal` was dropped.');
  }
  console.error('\nShipped files:');
  for (const p of [...shipped].sort()) console.error(`  ${p}`);
  console.error('');
  process.exit(1);
}

console.log(`verify-package: ok — ${shipped.size} files, all declared entry points present.`);
for (const p of [...expected].sort()) console.log(`  ✓ ${p}`);
console.log('  ✓ dist/html2canvas-pro.esm-<hash>.js');
