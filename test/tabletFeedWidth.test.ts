import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

// On iPad (native, so never isDesktop) the feed used the full window width and
// every card stretched edge to edge. contentMaxWidth is the window on phone and
// the capped reading column on tablet.
describe('tablet feed width', () => {
  it('watch caps the feed on tablet', () => {
    const src = read('app/(tabs)/watch.tsx');
    expect(src).toMatch(/const feedMaxWidth = layout\.isDesktop \? layout\.wideMaxWidth : layout\.contentMaxWidth;/);
    expect(src).not.toMatch(/feedMaxWidth = [^;]*layout\.width/);
  });

  it('home is one capped column in portrait and two columns in tablet landscape', () => {
    const src = read('app/(tabs)/home.tsx');
    expect(src).toMatch(/const useMasonry = layout\.isDesktop \|\| tabletLandscape;/);
    expect(src).toMatch(/const feedMaxWidth = useMasonry \? layout\.wideMaxWidth : layout\.contentMaxWidth;/);
    expect(src).not.toMatch(/feedMaxWidth = [^;]*layout\.width/);
  });

  it('off phone, the compact card divider is inset to the content edge', () => {
    const src = read('components/feed/FeedCard.tsx');
    expect(src).toMatch(/marginHorizontal: layout\.isPhone \? 0 : cardMargin/);
    expect(src).toMatch(/compactFeed \? \(layout\.isPhone \? cardMargin : 0\) : 18/);
  });

  it('the tab bar row is capped and centred', () => {
    expect(read('app/(tabs)/_layout.tsx')).toMatch(/maxWidth: layout\.contentMaxWidth, alignSelf: 'center'/);
  });
});
