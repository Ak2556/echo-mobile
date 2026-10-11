/**
 * "A feed that ends. No infinite scroll." is the page's headline claim, and Home used to
 * load the next page for as long as there was one. The visit is capped, the fetching stops
 * at the cap, and the bottom says so.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('the Home feed ends', () => {
  const home = read('app/(tabs)/home.tsx');

  it('caps what a visit shows', () => {
    expect(home).toMatch(/capFeed\(scopedAll\)/);
  });

  it('draws the end card at the bottom of the list', () => {
    expect(home).toMatch(/ListFooterComponent=\{feedEnded \? <FeedEnd \/> : null\}/);
  });

  it('stops fetching pages once a visit is full', () => {
    const hook = read('hooks/useFeed.ts');
    const infinite = hook.slice(hook.indexOf('export function useInfiniteFeed'), hook.indexOf('// Watch / Shorts feed'));
    expect(infinite).toContain('visitCapReached(allPages)');
  });

  it('the end card is translated into Hindi', () => {
    const hi = read('lib/i18n/i18nPhrasesHi.ts');
    for (const phrase of ["You're all caught up", 'That is everything for now. There is nothing hiding below.', "Today's question"]) {
      expect(hi, phrase).toContain(phrase);
    }
  });
});
