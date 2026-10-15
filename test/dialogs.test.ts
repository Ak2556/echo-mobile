/**
 * Destructive confirmations ("Delete this?", "Sign out?") were the operating system's own
 * Alert: a different look on every platform, ignoring the theme, with raw English buttons.
 * They go through confirmAction, drawn once by <ConfirmHost /> in the sheet every other
 * choice uses. Choices with more than two answers stay as lists.
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

// One alert offers three choices (make admin, remove from the group, cancel): a list, not a yes/no.
const THREE_CHOICES = new Set(['app/group/[id].tsx']);

describe('confirmations', () => {
  it('no Alert.alert carries a destructive yes/no', () => {
    const offenders: string[] = [];
    for (const d of ['app', 'components']) {
      for (const f of files(join(ROOT, d))) {
        const rel = relative(ROOT, f);
        if (THREE_CHOICES.has(rel)) continue;
        const src = readFileSync(f, 'utf8');
        const calls = src.split('Alert.alert(').slice(1);
        calls.forEach((c, i) => { if (/style:\s*'destructive'/.test(c.slice(0, 800))) offenders.push(`${rel} #${i + 1}`); });
      }
    }
    expect(offenders, 'use confirmAction from lib/ui/confirm').toEqual([]);
  });

  it('the host is mounted once, in the root layout', () => {
    expect(readFileSync(resolve(ROOT, 'app/_layout.tsx'), 'utf8')).toContain('<ConfirmHost />');
  });

  it('the sheet is the shared action sheet', () => {
    expect(readFileSync(resolve(ROOT, 'components/common/ConfirmSheet.tsx'), 'utf8')).toContain('<ActionSheet');
  });
});
