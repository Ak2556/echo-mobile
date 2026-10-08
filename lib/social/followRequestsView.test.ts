import { describe, expect, it } from 'vitest';
import { listIsCatchingUp } from './followRequestsView';

const VISIT = 1_000;

describe('listIsCatchingUp', () => {
  it('an empty cached list from before this visit, while a fetch runs, is not yet an answer', () => {
    expect(listIsCatchingUp({ isFetching: true, dataUpdatedAt: 500 }, 0, VISIT)).toBe(true);
  });

  it('shows the empty state once the fetch for this visit is done', () => {
    expect(listIsCatchingUp({ isFetching: false, dataUpdatedAt: 1_500 }, 0, VISIT)).toBe(false);
  });

  it('a fetch that finishes with data newer than the visit is an answer even if another starts', () => {
    expect(listIsCatchingUp({ isFetching: true, dataUpdatedAt: 1_500 }, 0, VISIT)).toBe(false);
  });

  it('never covers a list that has people in it', () => {
    expect(listIsCatchingUp({ isFetching: true, dataUpdatedAt: 500 }, 3, VISIT)).toBe(false);
  });

  it('emptying the list by answering the last request shows the empty state, not the loader', () => {
    // setQueryData stamps the list with the time of the answer, which is after the visit began.
    expect(listIsCatchingUp({ isFetching: true, dataUpdatedAt: 2_000 }, 0, VISIT)).toBe(false);
  });

  it('a fetch that never started leaves the cached empty list standing', () => {
    expect(listIsCatchingUp({ isFetching: false, dataUpdatedAt: 500 }, 0, VISIT)).toBe(false);
  });
});
