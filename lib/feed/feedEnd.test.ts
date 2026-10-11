import { describe, expect, it } from 'vitest';
import { FEED_VISIT_LIMIT, capFeed, feedHasEnded, visitCapReached } from './feedEnd';

const n = (count: number) => Array.from({ length: count }, (_, i) => i);

describe('capFeed', () => {
  it('keeps a short feed whole', () => {
    expect(capFeed(n(12))).toHaveLength(12);
  });
  it('cuts a long feed to one visit, keeping the top', () => {
    const out = capFeed(n(60));
    expect(out).toHaveLength(FEED_VISIT_LIMIT);
    expect(out[0]).toBe(0);
    expect(out[FEED_VISIT_LIMIT - 1]).toBe(FEED_VISIT_LIMIT - 1);
  });
  it('honours another limit and never goes negative', () => {
    expect(capFeed(n(10), 3)).toEqual([0, 1, 2]);
    expect(capFeed(n(10), -4)).toEqual([]);
  });
});

describe('visitCapReached', () => {
  it('counts across pages', () => {
    expect(visitCapReached([n(20)])).toBe(false);
    expect(visitCapReached([n(20), n(10)])).toBe(true);
  });
  it('is false for no pages', () => {
    expect(visitCapReached([])).toBe(false);
  });
});

describe('feedHasEnded', () => {
  it('ends on a full visit even if the server has more', () => {
    expect(feedHasEnded(FEED_VISIT_LIMIT, true)).toBe(true);
  });
  it('ends on a small network with nothing more to load', () => {
    expect(feedHasEnded(12, false)).toBe(true);
  });
  it('does not end while more is loading in', () => {
    expect(feedHasEnded(20, true)).toBe(false);
  });
  it('does not end before anything has loaded', () => {
    expect(feedHasEnded(0, false)).toBe(false);
  });
});
