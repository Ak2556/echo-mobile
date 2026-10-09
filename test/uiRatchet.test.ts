/**
 * Drift ratchets. Each number is a ceiling measured on main; a change that removes
 * drift lowers its ceiling in the same PR, and nothing may raise one. They exist so
 * the app can only get more uniform: raw sizes and OS dialogs were written one screen
 * at a time and nothing stopped the next screen adding more.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (p.endsWith('.tsx')) yield p;
  }
}

function count(re: RegExp, dirs: string[] = ['app']): number {
  let n = 0;
  for (const d of dirs) for (const f of sources(join(ROOT, d))) n += (readFileSync(f, 'utf8').match(re) ?? []).length;
  return n;
}

const CEILINGS = {
  rawRadius: 347,
  rawFontSize: 1258,
  alertAlert: 115,
};

describe('UI drift ratchets', () => {
  it('raw borderRadius numbers in app/', () => {
    expect(count(/borderRadius: \d+/g)).toBeLessThanOrEqual(CEILINGS.rawRadius);
  });
  it('raw fontSize numbers in app/', () => {
    expect(count(/fontSize: [\d.]+/g)).toBeLessThanOrEqual(CEILINGS.rawFontSize);
  });
  it('Alert.alert calls in app/ and components/', () => {
    expect(count(/Alert\.alert\(/g, ['app', 'components'])).toBeLessThanOrEqual(CEILINGS.alertAlert);
  });
});
