const NAME_KEY = 'io.issuetracker.sdk.reporterName';
const INSTALL_ID_KEY = 'io.issuetracker.sdk.installId';
const NAME_MAX = 80;

let memoryName: string | null = null;
let memoryInstallId: string | null = null;

function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !('localStorage' in window)) return null;
    // Probe write — Safari private mode throws on setItem.
    window.localStorage.setItem('__it_probe', '1');
    window.localStorage.removeItem('__it_probe');
    return window.localStorage;
  } catch {
    return null;
  }
}

export function getName(): string | null {
  const ls = safeStorage();
  if (ls) {
    const v = ls.getItem(NAME_KEY)?.trim();
    return v && v.length > 0 ? v : null;
  }
  return memoryName;
}

export function setName(name: string): void {
  const trimmed = name.trim();
  if (trimmed.length === 0) return;
  const capped = trimmed.slice(0, NAME_MAX);
  const ls = safeStorage();
  if (ls) ls.setItem(NAME_KEY, capped);
  else memoryName = capped;
}

export function clearName(): void {
  const ls = safeStorage();
  if (ls) ls.removeItem(NAME_KEY);
  memoryName = null;
}

export function getInstallId(): string {
  const ls = safeStorage();
  if (ls) {
    let v = ls.getItem(INSTALL_ID_KEY);
    if (v) return v;
    v = crypto.randomUUID();
    ls.setItem(INSTALL_ID_KEY, v);
    return v;
  }
  if (!memoryInstallId) memoryInstallId = crypto.randomUUID();
  return memoryInstallId;
}

export function reporterPayload(): Record<string, string> {
  const out: Record<string, string> = { installId: getInstallId() };
  const n = getName();
  if (n) out.name = n;
  return out;
}
