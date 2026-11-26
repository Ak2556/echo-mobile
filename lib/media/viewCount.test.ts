import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatViewCount } from './viewCount';

describe('formatViewCount', () => {
  it('shows small counts whole and large ones short', () => {
    expect(formatViewCount(0)).toBe('0');
    expect(formatViewCount(999)).toBe('999');
    expect(formatViewCount(1_000)).toBe('1K');
    expect(formatViewCount(1_250)).toBe('1.3K');
    expect(formatViewCount(3_400_000)).toBe('3.4M');
  });
});

// 2026-11-26: video tiles on a profile showed no view count.
describe('profile grid video tiles', () => {
  const grid = readFileSync('components/profile/PostsGrid.tsx', 'utf8');

  it('show the view count beside the play mark', () => {
    expect(grid).toMatch(/formatViewCount\(item\.viewCount/);
  });
});
