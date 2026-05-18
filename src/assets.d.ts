// tsup loader: { '.webp': 'dataurl' } — image imports resolve to a
// base64 data URL at build time. This declaration tells TS the type
// so type-checking doesn't fail at the import sites.
declare module '*.webp' {
  const dataUrl: string;
  export default dataUrl;
}
