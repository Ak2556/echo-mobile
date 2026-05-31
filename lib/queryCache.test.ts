import { describe, it, expect } from 'vitest';
import type { InfiniteData } from '@tanstack/react-query';
import { prependEchoToFeedCache } from './queryCache';
import type { FeedItem } from '../types';

// Minimal FeedItem factory — only the id matters for these cache tests.
const echo = (id: string): FeedItem => ({ id } as FeedItem);

describe('prependEchoToFeedCache', () => {
  it('returns a single-item array when the cache is empty (undefined/null)', () => {
    const fresh = echo('new');
    expect(prependEchoToFeedCache(undefined, fresh)).toEqual([fresh]);
    expect(prependEchoToFeedCache(null, fresh)).toEqual([fresh]);
  });

  it('prepends to a flat FeedItem[] cache', () => {
    const result = prependEchoToFeedCache([echo('a'), echo('b')], echo('new')) as FeedItem[];
    expect(result.map(e => e.id)).toEqual(['new', 'a', 'b']);
  });

  it('de-dupes by id in a flat cache (no duplicate when re-published)', () => {
    const result = prependEchoToFeedCache([echo('a'), echo('new')], echo('new')) as FeedItem[];
    expect(result.map(e => e.id)).toEqual(['new', 'a']);
  });

  it('handles InfiniteData<FeedItem[]> without throwing (the old.filter crash)', () => {
    // This is the exact shape that caused "old.filter is not a function":
    // the ['feed','paginated'] query holds { pages, pageParams }, not an array.
    const infinite: InfiniteData<FeedItem[]> = {
      pages: [[echo('a'), echo('b')], [echo('c')]],
      pageParams: [undefined, '2'],
    };
    const fn = () => prependEchoToFeedCache(infinite, echo('new'));
    expect(fn).not.toThrow();
    const result = fn() as InfiniteData<FeedItem[]>;
    // New echo lands at the front of the FIRST page only.
    expect(result.pages[0].map(e => e.id)).toEqual(['new', 'a', 'b']);
    expect(result.pages[1].map(e => e.id)).toEqual(['c']);
    // pageParams are preserved.
    expect(result.pageParams).toEqual([undefined, '2']);
  });

  it('de-dupes across all pages of InfiniteData', () => {
    const infinite: InfiniteData<FeedItem[]> = {
      pages: [[echo('a')], [echo('new'), echo('b')]],
      pageParams: [undefined, '2'],
    };
    const result = prependEchoToFeedCache(infinite, echo('new')) as InfiniteData<FeedItem[]>;
    expect(result.pages[0].map(e => e.id)).toEqual(['new', 'a']);
    expect(result.pages[1].map(e => e.id)).toEqual(['b']); // old 'new' removed
  });

  it('leaves an unrecognized shape untouched', () => {
    const weird = { foo: 'bar' };
    expect(prependEchoToFeedCache(weird, echo('new'))).toBe(weird);
  });
});
