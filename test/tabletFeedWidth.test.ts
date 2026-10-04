import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

// On iPad (native, so never isDesktop) the feed used the full window width and
// every card stretched edge to edge. contentMaxWidth is the window on phone and
// the capped reading column on tablet.
describe('tablet feed width', () => {
  it.each(['app/(tabs)/home.tsx', 'app/(tabs)/watch.tsx'])('%s caps the feed on tablet', (file) => {
    const src = read(file);
    expect(src).toMatch(/const feedMaxWidth = layout\.isDesktop \? layout\.wideMaxWidth : layout\.contentMaxWidth;/);
    expect(src).not.toMatch(/feedMaxWidth = [^;]*layout\.width/);
  });

  it('the tab bar row is capped and centred', () => {
    expect(read('app/(tabs)/_layout.tsx')).toMatch(/maxWidth: layout\.contentMaxWidth, alignSelf: 'center'/);
  });
});
