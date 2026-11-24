import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TT_PHRASES } from '../lib/i18n/i18nPhrases';

// 2026-11-24: in Hindi the Tools tab still said "ALL TOOLS · 12" and showed
// English lane chips; both rendered raw strings instead of going through ttx.
const src = readFileSync('app/(tabs)/apps.tsx', 'utf8');
const lanes = src.slice(src.indexOf('const TOOL_LANES'), src.indexOf('];', src.indexOf('const TOOL_LANES')));
const labels = [...lanes.matchAll(/label: '([^']+)'/g)].map(m => m[1]);

describe('Tools tab lane labels', () => {
  it('finds the lanes', () => {
    expect(labels.length).toBeGreaterThanOrEqual(8);
  });

  it('renders chips and the grid heading through ttx', () => {
    expect(src).toMatch(/\{ttx\(l\.label\)\}/);
    expect(src).toMatch(/ttx\('All tools'\)/);
    expect(src).not.toMatch(/`All tools ·/);
  });

  it('has a Hindi line for every lane and the heading', () => {
    const hi = (TT_PHRASES as Record<string, Record<string, string> | undefined>).hi ?? {};
    for (const s of [...labels, 'All tools']) expect(hi[s], s).toBeTruthy();
  });
});
