/**
 * M2, M9, L7 (2026-09-30 release audit) on the Explore tab:
 *  - M2: the first tap on a search result only dismissed the keyboard.
 *  - M9: the result filter chips (and the first row of the default view) sat
 *        inside the glass header's fade and rendered as unreadable smudges.
 *  - L7: the search field exposed no accessible name.
 * Layout is checked on device; these pin the three rules in source.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const explore = read('app/(tabs)/explore.tsx');

describe('Explore search', () => {
  it('results keep taps while the keyboard is up', () => {
    const results = explore.slice(explore.indexOf('keyboardShouldPersistTaps'), explore.indexOf('SEARCH_TABS.map'));
    expect(results).toMatch(/keyboardShouldPersistTaps="handled"/);
  });

  it('both lists start below the glass header fade', () => {
    expect(explore).toMatch(/paddingTop: headerHeight \+ EDGE_GLASS_FADE,/);
    expect(explore).toMatch(/paddingTop: headerHeight \+ EDGE_GLASS_FADE \+ 4,/);
    expect(explore).not.toMatch(/paddingTop: headerHeight(,| \+ 12,)/);
  });

  it('the fade length the lists clear is the one EdgeGlass draws', () => {
    expect(read('components/ui/EdgeGlass.tsx')).toMatch(/export const EDGE_GLASS_FADE = DEFAULT_FADE;/);
  });

  it('the search field has an accessible name', () => {
    expect(read('src/features/feed/ui/SearchBar.tsx')).toMatch(/accessibilityLabel=\{placeholder\}/);
  });
});
