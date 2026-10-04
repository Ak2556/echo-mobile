import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Owner report 2026-10-01: tapping a photo post opened the thread page, which
// is the same photo, title and actions again.
describe('feed photo posts', () => {
  it('a card tap opens the photo viewer, not the thread page', () => {
    const card = readFileSync('components/feed/FeedCard.tsx', 'utf8');
    const press = card.slice(card.indexOf('const handleMainPress'), card.indexOf('const toggleBookmarkPress'));
    expect(press).toMatch(/if \(isPhotoPost\) \{\s*setPhotoOpen\(true\);\s*return;\s*\}/);
    expect(card).toMatch(/<ZoomableImageViewer[\s\S]*?onClose=\{\(\) => setPhotoOpen\(false\)\}/);
  });
});
