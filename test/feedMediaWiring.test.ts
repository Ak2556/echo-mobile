import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The prefetch and Data Saver work is wired by source text that a type check
 * cannot validate: a row type spelled one way where the rows are built and
 * another where they are read compiles, passes, and does nothing. That happened
 * once while writing this (rows are 'post', the filter said 'item').
 */
const home = readFileSync('app/(tabs)/home.tsx', 'utf8');

describe('home feed prefetch wiring', () => {
  it('reads the same row type the rows are built with', () => {
    const built = home.match(/arr\.push\(\{ type: '([a-z]+)', item \}\)/)?.[1];
    const read = home.match(/prefetchMedia\(rows\.flatMap\(r => \(r\.type === '([a-z]+)'/)?.[1];
    expect(built, 'row type where rows are built').toBeTruthy();
    expect(read, 'row type where prefetch filters them').toBe(built);
  });

  it('prefetches from the viewability callback, using the rows the list shows', () => {
    expect(home).toMatch(/feedRowsRef\.current = popularItemsWithAds/);
    expect(home).toMatch(/useFeedMediaPrefetch\(\)/);
  });
});

describe('Data Saver and photos', () => {
  it('the feed photo grid holds a photo behind a tap while Data Saver is on', () => {
    const grid = readFileSync('components/feed/MediaGrid.tsx', 'utf8');
    expect(grid).toMatch(/useDataSaverPhoto\(uri, dataSaver\)/);
    expect(grid).toMatch(/if \(held\)/);
  });

  it('prefetching does nothing under Data Saver', () => {
    const hook = readFileSync('hooks/useFeedMediaPrefetch.ts', 'utf8');
    expect(hook).toMatch(/dataSaver \|\| !isAppOnline\(\)\) return/);
  });
});
