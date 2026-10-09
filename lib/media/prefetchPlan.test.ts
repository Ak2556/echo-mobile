import { describe, expect, it } from 'vitest';
import { isRemoteUri, planMediaPrefetch, type PrefetchItem } from './prefetchPlan';

const photo = (id: string, ...uris: string[]): PrefetchItem => ({ id, mediaUris: uris });
const video = (id: string, uri: string): PrefetchItem => ({ id, videoUri: uri });
const A = (n: number) => `https://cdn.example/${n}.jpg`;

describe('planMediaPrefetch', () => {
  it('looks only at the cards below the current one, never at the current or earlier ones', () => {
    const items = [photo('0', A(0)), photo('1', A(1)), photo('2', A(2))];
    expect(planMediaPrefetch(items, 1, new Set()).images).toEqual([A(2)]);
  });

  it('reaches a few cards ahead and no further', () => {
    const items = Array.from({ length: 12 }, (_, i) => photo(String(i), A(i)));
    expect(planMediaPrefetch(items, 0, new Set()).images).toEqual([A(1), A(2), A(3), A(4)]);
  });

  it('takes at most two images from one card', () => {
    const items = [photo('0'), photo('1', A(1), A(2), A(3), A(4))];
    expect(planMediaPrefetch(items, 0, new Set()).images).toEqual([A(1), A(2)]);
  });

  it('never fetches what it already has, or the same uri twice', () => {
    const items = [photo('0'), photo('1', A(1)), photo('2', A(1), A(2))];
    expect(planMediaPrefetch(items, 0, new Set([A(2)])).images).toEqual([A(1)]);
  });

  it('skips files already on the device', () => {
    const items = [photo('0'), photo('1', 'file:///tmp/a.jpg', 'content://media/1', A(1))];
    expect(planMediaPrefetch(items, 0, new Set()).images).toEqual([A(1)]);
  });

  it('asks for a poster only for the next couple of videos, not the whole window', () => {
    const items = [photo('0'), video('1', 'https://cdn/v1.mp4'), video('2', 'https://cdn/v2.mp4'), video('3', 'https://cdn/v3.mp4')];
    expect(planMediaPrefetch(items, 0, new Set()).videos).toEqual(['https://cdn/v1.mp4', 'https://cdn/v2.mp4']);
  });

  it('caps one call at eight fetches however many cards qualify', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: String(i), mediaUris: [A(i * 2), A(i * 2 + 1)], videoUri: `https://cdn/v${i}.mp4` }));
    const plan = planMediaPrefetch(items, 0, new Set(), { ahead: 10, videoAhead: 10 });
    expect(plan.images.length + plan.videos.length).toBeLessThanOrEqual(8);
  });

  it('copes with the end of the list and with a position it cannot use', () => {
    const items = [photo('0', A(0)), photo('1', A(1))];
    expect(planMediaPrefetch(items, 1, new Set())).toEqual({ images: [], videos: [] });
    expect(planMediaPrefetch(items, 99, new Set())).toEqual({ images: [], videos: [] });
    expect(planMediaPrefetch(items, NaN, new Set())).toEqual({ images: [], videos: [] });
    expect(planMediaPrefetch([], 0, new Set())).toEqual({ images: [], videos: [] });
  });

  it('can start from before the first card', () => {
    expect(planMediaPrefetch([photo('0', A(0))], -1, new Set()).images).toEqual([A(0)]);
  });
});

describe('isRemoteUri', () => {
  it('accepts http(s) only', () => {
    expect(isRemoteUri('https://a/b.jpg')).toBe(true);
    expect(isRemoteUri('HTTP://a/b.jpg')).toBe(true);
    expect(isRemoteUri('file:///a.jpg')).toBe(false);
    expect(isRemoteUri('')).toBe(false);
    expect(isRemoteUri(undefined)).toBe(false);
  });
});
