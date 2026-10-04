import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

// Video posts appear in the main feed as a tile that opens Reverb on that clip.
describe('videos in the main feed', () => {
  it('Home no longer filters videos out, in the hook or the screen', () => {
    expect(read('app/(tabs)/home.tsx')).not.toMatch(/f\.postType !== 'video'/);
    const infinite = read('hooks/useFeed.ts').split('export function useInfiniteFeed')[1].split('export function')[0];
    expect(infinite).not.toMatch(/item\.postType === 'video' \|\| !!item\.videoUri\) return false/);
    expect(infinite).not.toMatch(/item\.postType !== 'video' && !item\.videoUri/);
  });

  it('a video card is a tile (no player per card) whose tap opens Reverb on that video', () => {
    const card = read('components/feed/FeedCard.tsx');
    expect(card).toMatch(/<VideoTile[\s\S]*?pathname: '\/\(tabs\)\/watch', params: \{ echoId: item\.id \}/);
    // Only the full-bleed hero card still mounts a player.
    expect(card.match(/<VideoPreview/g)?.length).toBe(1);
  });

  it('the tile names the tab from the translation key, not a hard-coded name', () => {
    expect(read('components/feed/VideoTile.tsx')).toContain("t('nav.watch')");
  });
});
