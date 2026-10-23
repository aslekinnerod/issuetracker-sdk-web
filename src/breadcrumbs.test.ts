import { beforeEach, describe, expect, it, vi } from 'vitest';

const STORAGE_KEY = 'io.issuetracker.sdk.breadcrumbs';

// breadcrumbs.ts loads from localStorage once per module instance, so
// each case imports it fresh — same pattern as lifecycle.test.ts.
async function importFresh() {
  vi.resetModules();
  return import('./breadcrumbs');
}

function crumbs(n: number) {
  return Array.from({ length: n }, (_, i) => ({ timestamp: i, action: `a${i}` }));
}

describe('breadcrumbs', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('keeps only the five newest recorded entries', async () => {
    const { recordBreadcrumb, snapshotBreadcrumbs } = await importFresh();
    for (let i = 0; i < 8; i++) recordBreadcrumb(`a${i}`);
    expect(snapshotBreadcrumbs().map((c) => c.action)).toEqual(['a3', 'a4', 'a5', 'a6', 'a7']);
  });

  // The server rejects a report with more than five breadcrumbs, and
  // a failed submit leaves storage untouched — so an over-full stored
  // list would block every report from this browser until cleared.
  it('caps an over-full stored list to the five newest', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(crumbs(9)));
    const { snapshotBreadcrumbs } = await importFresh();
    expect(snapshotBreadcrumbs().map((c) => c.action)).toEqual(['a4', 'a5', 'a6', 'a7', 'a8']);
  });

  it('drops stored state that is not an array', async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ action: 'x' }));
    const { snapshotBreadcrumbs } = await importFresh();
    expect(snapshotBreadcrumbs()).toEqual([]);
  });
});
