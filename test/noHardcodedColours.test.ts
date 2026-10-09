/**
 * No hex literal in a screen. A hex in app/ is a colour that ignores the theme, the
 * dark/light switch and a custom accent: "#fff" on an accent button went white on
 * white in two of nine themes. Screens read `useTheme()`; the few colours that
 * should not follow it live, named, in lib/ui/fixedColors.ts.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');

// Files whose hex values are the content, not styling.
const CONTENT = new Map<string, string>([
  ['app/mini-apps/color-tools.tsx', 'a colour tool: the swatches are the product'],
  ['app/mini-apps/json-formatter.tsx', 'syntax-highlight colours for a code view'],
  ['app/+html.tsx', 'the web <meta name="theme-color"> tag, outside React Native'],
]);

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (p.endsWith('.tsx')) yield p;
  }
}

const HEX = /(['"`])#[0-9a-fA-F]{3,8}\1/;

describe('hard-coded colours', () => {
  it('no screen under app/ contains a quoted hex colour', () => {
    const offenders: string[] = [];
    for (const f of files(join(ROOT, 'app'))) {
      const rel = relative(ROOT, f);
      if (CONTENT.has(rel)) continue;
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (HEX.test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
      });
    }
    expect(offenders, `use useTheme() or lib/ui/fixedColors.ts:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('every exempt file still exists and still has a reason', () => {
    for (const [file, why] of CONTENT) {
      expect(() => statSync(join(ROOT, file)), file).not.toThrow();
      expect(why.length).toBeGreaterThan(10);
    }
  });

  it('the fixed colours are written in one file', () => {
    const src = readFileSync(join(ROOT, 'lib/ui/fixedColors.ts'), 'utf8');
    for (const name of ['WARM', 'BRAND', 'DARK', 'STATUS', 'ON_MEDIA', 'ON_STATUS', 'SWITCH_THUMB', 'SHADOW', 'STAGE']) {
      expect(src).toContain(`export const ${name}`);
    }
  });
});
