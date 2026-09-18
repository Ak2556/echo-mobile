import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

/**
 * The loading props, not the layout.
 *
 * MediaGrid had six separate <Image> call sites, each passing `contentFit` and
 * `cachePolicy` and nothing else. Three consequences, none of which show up in
 * a screenshot or a snapshot:
 *
 *   - no `recyclingKey`, so a recycled row keeps the previous post's photo on
 *     screen until the new one decodes. In a fast scroll that reads as the feed
 *     showing the wrong image, which is worse than showing none.
 *   - no `transition`, so an image pops in against grey rather than fading.
 *   - no `placeholder`, so that grey is all there is while it loads. On the
 *     connections this app is launching into, that is most of the time.
 *
 * Six call sites is also why this regressed: a prop added to one is not added
 * to the others. The component now renders a single GridImage, so the props are
 * declared once, and these tests assert every layout goes through it.
 */

vi.mock('../../../shared/lib/theme', () => ({
  useTheme: () => ({ radius: { md: 12, card: 16 } }),
}));

vi.mock('../../../../components/ui/ZoomableImageViewer', () => ({
  ZoomableImageViewer: () => null,
}));

vi.mock('phosphor-react-native', () => ({
  MagnifyingGlassPlus: () => null,
}));

import { MediaGrid } from './MediaGrid';
import { MEDIA_FADE_MS, mediaPlaceholderTint } from './mediaPlaceholder';

const uris = (n: number) => Array.from({ length: n }, (_, i) => `https://cdn.invalid/p${i}.jpg`);

function imagesIn(container: HTMLElement) {
  return Array.from(container.querySelectorAll('[data-image-source]'));
}

describe('MediaGrid image loading', () => {
  // Every layout branch, because the props were duplicated per branch and that
  // is exactly how one of them drifts.
  it.each([1, 2, 3, 4, 5])('renders %i image(s) with the full loading prop set', n => {
    const { container } = render(<MediaGrid uris={uris(n)} />);
    const imgs = imagesIn(container);

    // 5+ collapses into the 4-tile grid with a "+N" overlay.
    expect(imgs.length).toBe(Math.min(n, 4));

    for (const img of imgs) {
      const src = img.getAttribute('data-image-source')!;
      expect(src).toMatch(/^https:\/\/cdn\.invalid\//);

      // Keyed to the image itself: this is what stops a recycled cell showing
      // the row before it.
      expect(img.getAttribute('data-recycling-key'), `recyclingKey for ${src}`).toBe(src);

      // A fade, not a pop.
      const t = Number(img.getAttribute('data-transition'));
      expect(t, `transition for ${src}`).toBe(MEDIA_FADE_MS);

      // Unchanged from before; asserted so the rewrite cannot drop it.
      expect(img.getAttribute('data-cache-policy')).toBe('memory-disk');
      expect(img.getAttribute('data-content-fit')).toBe('cover');
    }
  });

  it('gives each image its own recycling key', () => {
    const { container } = render(<MediaGrid uris={uris(4)} />);
    const keys = imagesIn(container).map(i => i.getAttribute('data-recycling-key'));
    expect(new Set(keys).size).toBe(4);
  });

  it('keeps the +N overlay for more than four images', () => {
    const { container } = render(<MediaGrid uris={uris(7)} />);
    expect(container.textContent).toContain('+3');
  });

  it('gives each image a stable tint to load against', () => {
    // Stable across calls, so a recycled tile does not flicker a new colour,
    // and varied across a grid so four tiles are not one flat block.
    const a = mediaPlaceholderTint('https://cdn.invalid/p0.jpg');
    expect(mediaPlaceholderTint('https://cdn.invalid/p0.jpg')).toBe(a);
    const spread = new Set(uris(8).map(mediaPlaceholderTint));
    expect(spread.size).toBeGreaterThan(1);
    // An empty uri must still yield a colour rather than undefined.
    expect(mediaPlaceholderTint('')).toBeTruthy();
  });

  it('renders nothing for an empty list rather than an empty frame', () => {
    const { container } = render(<MediaGrid uris={[]} />);
    expect(imagesIn(container).length).toBe(0);
  });
});
