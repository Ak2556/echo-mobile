/**
 * Loading and empty were drawn one screen at a time: a centred spinner built in 24 places
 * (some on the page background, some not, some with a caption), and empty lists that
 * were an icon and two lines of text with a different CTA. LoadingState and EmptyState are
 * the two, and EmptyState's action is the shared Button.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

function* files(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (p.endsWith('.tsx')) yield p;
  }
}

describe('loading', () => {
  it('no screen builds its own centred accent spinner', () => {
    const own = /<View style=\{\{\s*flex: 1,\s*(?:justifyContent|alignItems): 'center',\s*(?:justifyContent|alignItems): 'center'[^}]*\}\}>\s*<ActivityIndicator color=\{colors\.accent\}/;
    const offenders: string[] = [];
    for (const d of ['app', 'components']) {
      for (const f of files(join(ROOT, d))) {
        const rel = relative(ROOT, f);
        if (rel.endsWith('LoadingState.tsx')) continue;
        if (own.test(readFileSync(f, 'utf8'))) offenders.push(rel);
      }
    }
    expect(offenders, 'use <LoadingState />').toEqual([]);
  });

  it('the screens that waited on a spinner use it', () => {
    for (const f of ['app/salons.tsx', 'app/office-hours.tsx', 'app/listing/[id].tsx', 'app/welcome.tsx', 'app/year-in-echo.tsx', 'components/feed/CommentsPanel.tsx']) {
      expect(read(f), f).toContain('<LoadingState');
    }
  });

  it('it can fill a screen, carry a message, and names itself to a screen reader', () => {
    const src = read('components/common/LoadingState.tsx');
    expect(src).toContain('screen');
    expect(src).toContain('message');
    expect(src).toContain('accessibilityRole="progressbar"');
  });
});

describe('empty', () => {
  it.each(['app/salons.tsx', 'app/office-hours.tsx', 'app/mini-apps/shopping-list.tsx'])('%s uses EmptyState', (f) => {
    expect(read(f)).toContain('<EmptyState');
  });

  it('EmptyState\'s action is the shared Button', () => {
    const src = read('components/common/EmptyState.tsx');
    expect(src).toContain('<Button');
    expect(src).not.toContain('Pressable');
  });
});
