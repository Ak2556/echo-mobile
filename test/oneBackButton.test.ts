import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Back is one control: the same arrow, the same 44 pt target, the same place and the same
 * behaviour on every screen, so the thumb learns it once. Fourteen screens used to draw their own
 * at 22, 24 or 28 px in a 32 to 36 pt target; some called `router.back()`, which does nothing when
 * a notification or link opened the screen.
 */
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap(f => {
    const abs = join(dir, f);
    if (statSync(abs).isDirectory()) return walk(abs);
    return abs.endsWith('.tsx') && !abs.endsWith('.test.tsx') ? [abs] : [];
  });

/** A left arrow that means "previous", not "back". Adding to this list is a decision, with a reason. */
const PREVIOUS_NOT_BACK: Record<string, string> = {
  'app/mini-apps/planner.tsx': 'previous day',
  'components/mini-apps/HabitDetail.tsx': 'previous month',
  'components/ui/ZoomableImageViewer.tsx': 'previous photo',
};

describe('one back control', () => {
  it('no screen or component draws its own left arrow', () => {
    const offenders = [...walk('app'), ...walk('components')]
      .filter(f => !f.endsWith('components/ui/BackButton.tsx'))
      .filter(f => !(f in PREVIOUS_NOT_BACK))
      .filter(f => /<(ArrowLeft|CaretLeft)\b/.test(readFileSync(f, 'utf8')));
    expect(offenders, 'use <BackButton /> from components/ui/BackButton').toEqual([]);
  });

  it('both shared headers use it', () => {
    expect(readFileSync('components/ui/ScreenHeader.tsx', 'utf8')).toMatch(/<BackButton\b/);
    expect(readFileSync('components/mini-apps/MiniAppShell.tsx', 'utf8')).toMatch(/<BackButton\b/);
  });

  it('is 44 pt, and goes back safely by default', () => {
    const button = readFileSync('components/ui/BackButton.tsx', 'utf8');
    expect(button).toMatch(/hitSize=\{44\}/);
    expect(button).toMatch(/onPress \?\? \(\(\) => safeBack\(fallback\)\)/);
  });

  it('mini-apps fall back to the Tools tab when nothing is behind them', () => {
    expect(readFileSync('components/mini-apps/MiniAppShell.tsx', 'utf8')).toMatch(/<BackButton fallback="\/\(tabs\)\/apps"/);
  });

  it('the converted screens kept their own fallbacks', () => {
    expect(readFileSync('app/messages/[id].tsx', 'utf8')).toMatch(/<BackButton fallback=\{'\/messages'\}/);
    expect(readFileSync('app/listing/[id].tsx', 'utf8')).toMatch(/<BackButton fallback=\{'\/mini-apps\/marketplace'\}/);
  });
});
