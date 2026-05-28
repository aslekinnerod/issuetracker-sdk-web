import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs', 'iife'],
  globalName: 'Issuetracker',
  dts: true,
  sourcemap: true,
  clean: true,
  minify: true,
  target: 'es2020',
  platform: 'browser',
  treeshake: true,
  // Bundle html2canvas into our own dist so the SDK is fully
  // self-contained. The dynamic import() in screenshot.ts still
  // code-splits it into a local chunk (lazy-loaded only when a
  // report is triggered), but consumers no longer have to resolve
  // it themselves — some bundler setups failed to resolve the bare
  // external specifier, silently breaking screenshots.
  noExternal: ['html2canvas'],
  // Onboarding illustrations are imported as base64 data URLs so they
  // ship inline (no runtime fetch, no CDN dependency). WebP keeps the
  // bundle under ~70 KB; raw SVG of the same illustrations would be
  // ~1 MB inline.
  loader: { '.webp': 'dataurl' },
});
