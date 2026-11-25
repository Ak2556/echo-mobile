import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PHOTO_CROP_POSITION } from '../lib/media/mediaFrame';

// 2026-11-25, iPhone: a 3:4 photo of a person showed only the chest in the feed
// (centred crop of a 240pt frame), and the full-screen photo viewer let the
// Edit Profile screen show through its 0.97 backdrop.

const read = (p: string) => readFileSync(p, 'utf8');

describe('photo framing', () => {
  it('crops feed photos from the upper third, not the middle', () => {
    const top = parseFloat(PHOTO_CROP_POSITION.top);
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThan(50);
    expect(read('components/feed/MediaGrid.tsx')).toMatch(/contentPosition=\{PHOTO_CROP_POSITION\}/);
  });

  it('draws the full-screen viewer on solid black', () => {
    const viewer = read('components/ui/ZoomableImageViewer.tsx');
    expect(viewer).toMatch(/flex: 1, backgroundColor: '#000000'/);
    expect(viewer).not.toMatch(/rgba\(0,\s*0,\s*0,\s*0\.9\d?\)/);
  });
});
