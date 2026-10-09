/**
 * A <RefreshControl> that shows a query's own fetching flag draws its ring on every
 * background refetch: on Home it appeared over "Welcome back," each time the app
 * returned to the foreground or an OTA relaunched. The ring belongs to the user's
 * pull; useUserRefresh holds that.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');

function* files(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (p.endsWith('.tsx')) yield p;
  }
}

describe('RefreshControl', () => {
  it('is never bound to a query fetching flag', () => {
    const offenders: string[] = [];
    for (const d of ['app', 'components']) {
      for (const f of files(join(ROOT, d))) {
        readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
          if (/refreshing=\{\s*([\w.]*is(Re)?[Ff]etching\w*|answersLoading)\s*\}/.test(line)) offenders.push(`${relative(ROOT, f)}:${i + 1}`);
        });
      }
    }
    expect(offenders, 'bind refreshing to useUserRefresh(...)').toEqual([]);
  });

  it('the screens that had the bug use the hook', () => {
    for (const f of ['app/(tabs)/home.tsx', 'app/(tabs)/explore.tsx', 'app/(tabs)/notifications.tsx', 'app/(tabs)/watch.tsx', 'app/bookmarks.tsx', 'components/feed/CommentsPanel.tsx', 'app/daily-question.tsx']) {
      expect(readFileSync(resolve(ROOT, f), 'utf8'), f).toContain('useUserRefresh(');
    }
  });
});
