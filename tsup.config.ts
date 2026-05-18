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
  // Onboarding illustrations are imported as base64 data URLs so they
  // ship inline (no runtime fetch, no CDN dependency). WebP keeps the
  // bundle under ~70 KB; raw SVG of the same illustrations would be
  // ~1 MB inline.
  loader: { '.webp': 'dataurl' },
});
