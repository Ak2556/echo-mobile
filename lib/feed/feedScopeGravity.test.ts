import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GRAVITY, gravityForScope, rankTrending } from './feedScoring';

describe('gravityForScope', () => {
  it('ranks the Trending chip by engagement and the rest by recency', () => {
    expect(gravityForScope('forYou')).toBe(GRAVITY.popular);
    expect(gravityForScope('latest')).toBe(GRAVITY.latest);
    expect(gravityForScope('following')).toBe(GRAVITY.latest);
    expect(gravityForScope('semantic')).toBe(GRAVITY.latest);
  });

  it('makes Trending and Latest actually differ', () => {
    expect(gravityForScope('forYou')).not.toBe(gravityForScope('latest'));
  });
});

describe('Home feed has one ranking control', () => {
  const useFeed = readFileSync('hooks/useFeed.ts', 'utf8');
  const settings = readFileSync('app/settings.tsx', 'utf8');
  const home = readFileSync('app/(tabs)/home.tsx', 'utf8');

  it('ignores the old hidden Feed Sort value', () => {
    expect(useFeed).not.toMatch(/feedSort/);
    expect(settings).not.toMatch(/Feed Sort/);
  });

  it('pins a copy of the chips once the in-list row scrolls under the header', () => {
    expect(home).toMatch(/railYRef\.current = e\.nativeEvent\.layout\.y/);
    expect(home).toMatch(/railPinned && !focusedHome/);
  });

  it('names the section after the selected chip, not always "Top conversations"', () => {
    expect(home).toMatch(/feedScope === 'forYou' \? t\('home\.topConversations'\) : feedScopeLabel\(feedScope, t\)/);
  });
});

describe('rankTrending', () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const video = (id: string, likes: number, ageH: number) => ({
    id, likes, commentCount: 0, repostCount: 0, viewCount: 10, createdAt: hoursAgo(ageH), postType: 'video',
  });

  it('puts an engaged older video above a newer one nobody liked', () => {
    const ranked = rankTrending([video('new-quiet', 0, 1), video('older-liked', 40, 48)]);
    expect(ranked.map(v => v.id)).toEqual(['older-liked', 'new-quiet']);
  });

  it('does not mutate its input', () => {
    const input = [video('a', 0, 1), video('b', 40, 48)];
    rankTrending(input);
    expect(input.map(v => v.id)).toEqual(['a', 'b']);
  });
});

describe('Flow has Trending | New', () => {
  const watch = readFileSync('app/(tabs)/watch.tsx', 'utf8');
  const useFeed = readFileSync('hooks/useFeed.ts', 'utf8');

  it('passes the selected tab to the video feed, defaulting to Trending', () => {
    expect(watch).toMatch(/useState<FlowSort>\('trending'\)/);
    expect(watch).toMatch(/useInfiniteVideoFeed\(sort\)/);
  });

  it('keys the video query by tab so the two lists never share a cache entry', () => {
    expect(useFeed).toMatch(/\['feed', 'videos', sort,/);
  });
});
