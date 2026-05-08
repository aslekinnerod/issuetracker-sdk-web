import type { Breadcrumb } from './runtime';

const STORAGE_KEY = 'io.issuetracker.sdk.breadcrumbs';
const MAX_ENTRIES = 5;
const ACTION_MAX = 80;
const META_KEY_MAX = 64;
const META_VALUE_MAX = 256;
const MAX_META_PAIRS = 5;

let entries: Breadcrumb[] = [];
let loaded = false;

function safeStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && 'localStorage' in window) return window.localStorage;
  } catch {
    /* sandboxed */
  }
  return null;
}

function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  const ls = safeStorage();
  if (!ls) return;
  try {
    const raw = ls.getItem(STORAGE_KEY);
    if (raw) entries = JSON.parse(raw) as Breadcrumb[];
  } catch {
    entries = [];
  }
}

function persist(): void {
  const ls = safeStorage();
  if (!ls) return;
  try {
    ls.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* quota / private mode */
  }
}

export function recordBreadcrumb(action: string, metadata?: Record<string, string>): void {
  const trimmed = action.trim();
  if (trimmed.length === 0) return;
  ensureLoaded();
  let cappedMeta: Record<string, string> | undefined;
  if (metadata) {
    const pairs = Object.entries(metadata).slice(0, MAX_META_PAIRS);
    if (pairs.length > 0) {
      cappedMeta = {};
      for (const [k, v] of pairs) {
        cappedMeta[k.slice(0, META_KEY_MAX)] = String(v).slice(0, META_VALUE_MAX);
      }
    }
  }
  entries.push({
    timestamp: Date.now(),
    action: trimmed.slice(0, ACTION_MAX),
    metadata: cappedMeta,
  });
  while (entries.length > MAX_ENTRIES) entries.shift();
  persist();
}

export function snapshotBreadcrumbs(): Breadcrumb[] {
  ensureLoaded();
  return [...entries];
}

export function clearBreadcrumbs(): void {
  entries = [];
  const ls = safeStorage();
  if (ls) ls.removeItem(STORAGE_KEY);
}
