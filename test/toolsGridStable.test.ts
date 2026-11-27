import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// 2026-11-27, owner's iPhone: one Tools tile invisible and Shopping drawn over
// Planner. Tiles in a View per row remounted when recents reordered them, and
// their entering animation froze part-way.
const src = readFileSync('app/(tabs)/apps.tsx', 'utf8');
const card = src.slice(src.indexOf('function AppCard'), src.indexOf('/** Compact tool chip'));

describe('Tools grid', () => {
  it('tiles have no entering animation', () => {
    expect(card).not.toMatch(/entering=/);
  });

  it('is one wrapping container keyed by tool, not a View per row', () => {
    expect(src).toMatch(/flexWrap: 'wrap', columnGap: GAP[\s\S]{0,120}key=\{app\.id\}/);
    expect(src).not.toMatch(/grid\.map\(\(row, ri\)/);
  });

  it('keeps catalog order instead of re-sorting by recency', () => {
    expect(src).not.toMatch(/recencyIndex/);
  });
});
