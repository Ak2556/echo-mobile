import { describe, it, expect } from 'vitest';
import type { InfiniteData } from '@tanstack/react-query';
import { QueryClient } from '@tanstack/react-query';
import { patchFollowCaches, patchFollowRevert, patchLikeCaches, prependEchoToFeedCache } from './queryCache';
import type { FeedItem } from '../../types';

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

describe('patchLikeCaches across feed shapes', () => {
  const item = (id: string): FeedItem =>
    ({ id, likes: 1, isLiked: false } as unknown as FeedItem);

  it('patches an infinite feed that is not keyed "paginated"', () => {
    // The Flow feed is keyed ['feed','videos',…] and holds InfiniteData. It
    // used to match only the flat-array branch, fail the Array.isArray guard
    // and come back untouched — so likes on Flow had no optimistic update.
    const qc = new QueryClient();
    qc.setQueryData(['feed', 'videos', [], [], []], {
      pages: [[item('a'), item('b')]],
      pageParams: [undefined],
    });

    patchLikeCaches(qc, 'a', true);

    const data = qc.getQueryData(['feed', 'videos', [], [], []]) as
      { pages: FeedItem[][] };
    expect(data.pages[0][0].isLiked).toBe(true);
    expect(data.pages[0][0].likes).toBe(2);
    expect(data.pages[0][1].isLiked).toBe(false);
  });

  it('still patches a flat feed cache', () => {
    const qc = new QueryClient();
    qc.setQueryData(['feed'], [item('a')]);
    patchLikeCaches(qc, 'a', true);
    expect((qc.getQueryData(['feed']) as FeedItem[])[0].likes).toBe(2);
  });

  it('leaves a cache of an unexpected shape alone rather than corrupting it', () => {
    const qc = new QueryClient();
    qc.setQueryData(['feed', 'meta'], { total: 3 });
    patchLikeCaches(qc, 'a', true);
    expect(qc.getQueryData(['feed', 'meta'])).toEqual({ total: 3 });
  });
});

describe('follow state on a private account', () => {
  const bundle = (over: Record<string, unknown> = {}) => ({
    user: { id: 'u1', followerCount: 5 },
    echoes: [],
    isFollowing: false,
    isRequested: false,
    isSelf: false,
    ...over,
  });
  const setup = (over?: Record<string, unknown>) => {
    const qc = new QueryClient();
    qc.setQueryData(['profile', 'u1'], bundle(over));
    return { qc, read: () => qc.getQueryData(['profile', 'u1']) as ReturnType<typeof bundle> };
  };

  it('a plain follow adds a follower and clears any request', () => {
    const { qc, read } = setup({ isRequested: true });
    patchFollowCaches(qc, 'u1', true);
    expect(read()).toMatchObject({ isFollowing: true, isRequested: false });
    expect(read().user.followerCount).toBe(6);
  });

  it('a request shows "requested" and adds no follower, because none exists until approval', () => {
    const { qc, read } = setup();
    patchFollowCaches(qc, 'u1', true, { requested: true });
    expect(read()).toMatchObject({ isFollowing: false, isRequested: true });
    expect(read().user.followerCount).toBe(5);
  });

  it('withdrawing a request takes no follower off the count', () => {
    const { qc, read } = setup({ isRequested: true });
    patchFollowCaches(qc, 'u1', false, { wasRequested: true });
    expect(read()).toMatchObject({ isFollowing: false, isRequested: false });
    expect(read().user.followerCount).toBe(5);
  });

  it('a real unfollow still takes one off', () => {
    const { qc, read } = setup({ isFollowing: true });
    patchFollowCaches(qc, 'u1', false);
    expect(read().user.followerCount).toBe(4);
  });

  it('reverting each tap restores what it changed', () => {
    const request = setup();
    patchFollowCaches(request.qc, 'u1', true, { requested: true });
    patchFollowRevert(request.qc, 'u1', true, 'request');
    expect(request.read()).toMatchObject({ isFollowing: false, isRequested: false });
    expect(request.read().user.followerCount).toBe(5);

    const cancel = setup({ isRequested: true });
    patchFollowCaches(cancel.qc, 'u1', false, { wasRequested: true });
    patchFollowRevert(cancel.qc, 'u1', false, 'cancel-request');
    expect(cancel.read()).toMatchObject({ isFollowing: false, isRequested: true });
    expect(cancel.read().user.followerCount).toBe(5);

    const plain = setup();
    patchFollowCaches(plain.qc, 'u1', true);
    patchFollowRevert(plain.qc, 'u1', true);
    expect(plain.read()).toMatchObject({ isFollowing: false });
    expect(plain.read().user.followerCount).toBe(5);
  });
});
