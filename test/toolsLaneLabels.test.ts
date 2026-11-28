import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TT_PHRASES } from '../lib/i18n/i18nPhrases';

// 2026-11-28 simplify: the Tools tab is search, a Recent row, every tool, and
// the Today cards when they have something in them. The lane chips (Master,
// Plan, …), the Smart start card and "Your target" are gone from it; choosing
// the target moved to the Progress screen.
const src = readFileSync('app/(tabs)/apps.tsx', 'utf8');
const progress = readFileSync('app/target-progress.tsx', 'utf8');
const hi = (TT_PHRASES as Record<string, Record<string, string> | undefined>).hi ?? {};

describe('Tools tab layout', () => {
  it('has no lane chips, no Smart start card, no target picker and no filler lines', () => {
    expect(src).not.toMatch(/TOOL_LANES|SmartStartCard|TARGET_CATEGORIES|Private · Ready|connected essentials/);
  });

  it('shows tools once before the grid: one Recent row of up to four', () => {
    expect(src).toMatch(/ttx\("Recent"\)/);
    expect(src).toMatch(/\.slice\(0, 4\)/);
    expect(src).not.toMatch(/Jump back in/);
  });

  it('hides the Today cards when every one is zero', () => {
    expect(src).toMatch(/\{hasToday && dashboard && \(/);
  });

  it('draws the grid heading through ttx with Hindi', () => {
    expect(src).toMatch(/ttx\('All tools'\)/);
    for (const s of ['All tools', 'Recent', 'Today']) expect(hi[s], s).toBeTruthy();
  });
});

describe('Progress screen', () => {
  it('is where the target is chosen now, every option translated', () => {
    expect(progress).toMatch(/TARGET_CATEGORIES\.map/);
    expect(progress).toMatch(/onPress=\{\(\) => setTargetCategory\(option\.id\)\}/);
    expect(progress).toMatch(/\{ttx\(option\.label\)\}/);
    const labels = [...readFileSync('lib/retention/targetCategories.ts', 'utf8').matchAll(/label: '([^']+)'/g)].map(m => m[1]);
    expect(labels.length).toBeGreaterThan(10);
    for (const l of labels) expect(hi[l], l).toBeTruthy();
  });
});
