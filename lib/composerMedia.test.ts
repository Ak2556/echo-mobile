import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { composerMediaAspect, formatClipDuration, parseTags } from './composerMedia';

describe('composerMediaAspect', () => {
  it('keeps a photo its own shape within the feed range', () => {
    expect(composerMediaAspect(1080, 1350)).toBeCloseTo(0.8);     // portrait 4:5
    expect(composerMediaAspect(1920, 1080)).toBeCloseTo(16 / 9);  // landscape
    expect(composerMediaAspect(1080, 2400)).toBeCloseTo(0.8);     // tall screenshot clamps
    expect(composerMediaAspect(4000, 1000)).toBeCloseTo(1.91);    // panorama clamps
    expect(composerMediaAspect(null, null)).toBeCloseTo(0.8);
  });
});

describe('formatClipDuration', () => {
  it('formats picker milliseconds', () => {
    expect(formatClipDuration(5000)).toBe('0:05');
    expect(formatClipDuration(72_400)).toBe('1:12');
    expect(formatClipDuration(0)).toBeNull();
    expect(formatClipDuration(undefined)).toBeNull();
  });
});

describe('parseTags', () => {
  it('splits on spaces or commas, drops #, de-duplicates', () => {
    expect(parseTags('#travel, food  ai,#food')).toEqual(['travel', 'food', 'ai']);
    expect(parseTags('  , ')).toEqual([]);
  });
});

describe('composer option wiring', () => {
  const src = (p: string) => readFileSync(p, 'utf8');
  const composer = src('app/create-post.tsx');

  it('publishes the same tags the preview shows', () => {
    expect(composer).toMatch(/const hashtags = parsedTags;/);
  });

  it('has no duplicate Library/Camera or Library/Record bars', () => {
    expect(composer).not.toMatch(/\{ttx\("Library"\)\}/);
    expect(composer).not.toMatch(/\{ttx\("Record"\)\}/);
  });

  it('Camera offers both photo and video', () => {
    expect(composer).toMatch(/label: ttx\('Take a photo'\)/);
    expect(composer).toMatch(/label: ttx\('Record a video'\)/);
  });

  it('multiline inputs start at the top on Android', () => {
    expect((composer.match(/textAlignVertical="top"/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('shows the picked song', () => {
    expect(composer).toMatch(/\{selectedMusic && \(/);
  });

  it('asks Spotify for at most 10 results (its limit since February 2026)', () => {
    expect(src('supabase/functions/spotify-search/index.ts')).toMatch(/const MAX_RESULTS = 10;/);
  });

  it('music search errors are readable, not the raw edge-function message', () => {
    expect(src('components/ui/MusicPicker.tsx')).not.toMatch(/setError\(err\.message/);
  });

  it('a local video that cannot preview never falls back to a WebView', () => {
    expect(src('src/features/feed/ui/VideoPreview.tsx')).toMatch(/loadState === 'error' && !isLocalUri/);
  });
});
