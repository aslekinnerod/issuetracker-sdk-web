import { defineConfig } from 'vitest/config';

// happy-dom gives us a fast, dependency-free DOM + localStorage for
// the lifecycle persistence tests. jsdom would also work; happy-dom
// is noticeably faster for small unit suites.
export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: false,
  },
});
