import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPORTER_STYLES } from './ui/styles';

// WCAG contrast regression tests (ISU-39).
//
// Colors are extracted from the real stylesheets — REPORTER_STYLES is
// imported directly; the onboarding and floating-widget stylesheets are
// module-private template literals, so they are sliced out of the
// source files. Either way a color change in the source is picked up
// here automatically: the assertion is on the *computed ratio*, not on
// a frozen hex, so a compliant re-tint passes and a regression fails.

// --- WCAG 2.x contrast math (https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio)

function srgbChannel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.replace(/./g, (ch) => ch + ch) : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// --- Stylesheet sources

// happy-dom rewrites import.meta.url to an http: URL, so resolve from
// the vitest root (the package root) instead.
const read = (rel: string): string => readFileSync(join(process.cwd(), 'src', rel), 'utf8');

/** The onboarding popover stylesheet (module-private `STYLES` in onboarding.ts). */
function onboardingStyles(): string {
  const src = read('./onboarding.ts');
  const m = src.match(/const STYLES = `([\s\S]*?)`;/);
  if (!m) throw new Error('could not find STYLES template literal in onboarding.ts');
  return m[1];
}

/** The floating-widget stylesheet (inline <style> in triggers/widget.ts). */
function widgetStyles(): string {
  const src = read('./triggers/widget.ts');
  const m = src.match(/<style>([\s\S]*?)<\/style>/);
  if (!m) throw new Error('could not find <style> block in triggers/widget.ts');
  return m[1];
}

// --- CSS value extraction

const NAMED: Record<string, string> = { white: '#FFFFFF', black: '#000000' };

/** Returns the declaration block for the first occurrence of `selector { ... }`. */
function block(css: string, selector: string): string {
  const idx = css.indexOf(`${selector} {`);
  if (idx === -1) throw new Error(`selector not found: ${selector}`);
  const open = css.indexOf('{', idx);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

/** Extracts a hex color for `prop` inside `selector`'s block (first hex in the value). */
function cssColor(css: string, selector: string, prop: string): string {
  const body = block(css, selector);
  const m = body.match(new RegExp(`${prop}:\\s*([^;]+);`));
  if (!m) throw new Error(`property ${prop} not found in ${selector}`);
  const value = m[1].trim();
  const hex = value.match(/#[0-9a-fA-F]{3,6}/)?.[0] ?? NAMED[value.split(/\s/)[0]];
  if (!hex) throw new Error(`no color literal in "${prop}: ${value}" (${selector})`);
  return hex;
}

const REPORTER = REPORTER_STYLES;
const ONBOARDING = onboardingStyles();
const WIDGET = widgetStyles();

// --- Token pairs under regression protection.
// Add rows here as new UI colors land. min is the WCAG threshold:
// 4.5 for normal text (1.4.3), 3.0 for non-text UI (1.4.11).

interface Pair {
  name: string;
  fg: string;
  bg: string;
  min: number;
}

const PAIRS: Pair[] = [
  // Reporter sheet (src/ui/styles.ts)
  {
    name: 'reporter primary button label on button fill',
    fg: cssColor(REPORTER, '.footer .primary', 'color'),
    bg: cssColor(REPORTER, '.footer .primary', 'background'),
    min: 4.5,
  },
  {
    name: 'reporter error text on sheet',
    fg: cssColor(REPORTER, '.error', 'color'),
    bg: cssColor(REPORTER, '.sheet', 'background'),
    min: 4.5,
  },
  {
    name: 'reporter field labels on sheet',
    fg: cssColor(REPORTER, 'label', 'color'),
    bg: cssColor(REPORTER, '.sheet', 'background'),
    min: 4.5,
  },
  {
    name: 'reporter input border on sheet (non-text, 1.4.11)',
    fg: cssColor(REPORTER, 'input[type=text], textarea', 'border').replace(/^.*(#\w{6}).*$/, '$1'),
    bg: cssColor(REPORTER, '.sheet', 'background'),
    min: 3.0,
  },
  {
    name: 'reporter focus outline on sheet (non-text, 1.4.11)',
    fg: cssColor(REPORTER, 'button:focus-visible', 'outline'),
    bg: cssColor(REPORTER, '.sheet', 'background'),
    min: 3.0,
  },
  // Onboarding popover (src/onboarding.ts)
  {
    name: 'onboarding primary button label on button fill',
    fg: cssColor(ONBOARDING, '.primary', 'color'),
    bg: cssColor(ONBOARDING, '.primary', 'background'),
    min: 4.5,
  },
  {
    name: 'onboarding subtitle on sheet',
    fg: cssColor(ONBOARDING, '.subtitle', 'color'),
    bg: cssColor(ONBOARDING, '.sheet', 'background'),
    min: 4.5,
  },
  {
    name: 'onboarding focus outline on sheet (non-text, 1.4.11)',
    fg: cssColor(ONBOARDING, 'button:focus-visible', 'outline'),
    bg: cssColor(ONBOARDING, '.sheet', 'background'),
    min: 3.0,
  },
];

describe('WCAG contrast math', () => {
  it('black on white is 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });

  it('same color is 1:1 and order-independent', () => {
    expect(contrastRatio('#1577AD', '#1577AD')).toBeCloseTo(1, 10);
    expect(contrastRatio('#1577AD', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#1577AD'), 10);
  });

  it('matches a known reference value (#767676 on white ≈ 4.54)', () => {
    expect(contrastRatio('#767676', '#FFFFFF')).toBeCloseTo(4.54, 2);
  });
});

describe('token contrast', () => {
  it.each(PAIRS)('$name: $fg on $bg >= $min', ({ fg, bg, min }) => {
    const ratio = contrastRatio(fg, bg);
    expect(ratio, `${fg} on ${bg} is ${ratio.toFixed(3)}:1, needs ${min}:1`).toBeGreaterThanOrEqual(min);
  });
});

// --- Antipattern guards
//
// `all: unset` on a button strips the UA focus ring; any stylesheet
// that uses it MUST restore focus visibility with a button:focus-visible
// outline rule (WCAG 2.4.7). This encodes the invariant file-level so a
// refactor can't silently drop the restoration.

const FOCUS_RULE = /button:focus-visible\s*{[^}]*outline:\s*(?!none)[^};]+/;

const SHEETS: Array<{ name: string; css: string }> = [
  { name: 'REPORTER_STYLES (src/ui/styles.ts)', css: REPORTER },
  { name: 'floating widget (src/triggers/widget.ts)', css: WIDGET },
  { name: 'onboarding (src/onboarding.ts)', css: ONBOARDING },
];

describe('focus-visibility guards', () => {
  it.each(SHEETS)('$name has a button:focus-visible outline rule', ({ css }) => {
    expect(css).toMatch(FOCUS_RULE);
  });

  it.each(SHEETS)('$name: every `all: unset` sheet restores the focus ring', ({ css }) => {
    if (css.includes('all: unset') || css.includes('all:unset')) {
      expect(css, '`all: unset` strips the UA focus ring — restore it with button:focus-visible').toMatch(FOCUS_RULE);
    }
  });
});
