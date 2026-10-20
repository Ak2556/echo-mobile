import { describe, expect, it } from 'vitest';
import { posterPrefetchIds, warmIdsAround } from './videoWarm';

const ids = ['a', 'b', 'c', 'd', 'e'];

describe('warmIdsAround', () => {
  it('warms the next card first, then the previous', () => {
    expect(warmIdsAround(ids, 2)).toEqual(['d', 'b']);
  });

  it('has no previous at the start and no next at the end', () => {
    expect(warmIdsAround(ids, 0)).toEqual(['b']);
    expect(warmIdsAround(ids, 4)).toEqual(['d']);
  });

  it('warms only the next card on a low-tier device', () => {
    expect(warmIdsAround(ids, 2, 'low')).toEqual(['d']);
  });

  it('warms nothing for an index that is not in the list', () => {
    expect(warmIdsAround(ids, -1)).toEqual([]);
    expect(warmIdsAround(ids, 9)).toEqual([]);
    expect(warmIdsAround([], 0)).toEqual([]);
    expect(warmIdsAround(ids, 1.5)).toEqual([]);
  });
});

describe('posterPrefetchIds', () => {
  it('takes the next few cards, nearest first', () => {
    expect(posterPrefetchIds(ids, 1, 2)).toEqual(['c', 'd']);
    expect(posterPrefetchIds(ids, 3, 3)).toEqual(['e']);
  });

  it('starts from the top before anything is active', () => {
    expect(posterPrefetchIds(ids, -1, 2)).toEqual(['a', 'b']);
  });
});
