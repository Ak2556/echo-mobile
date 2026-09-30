import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GRAVITY, gravityForScope } from './feedScoring';

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
  const useFeed = readFileSync('src/features/feed/api/useFeed.ts', 'utf8');
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
