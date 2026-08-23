/**
 * Profile section bucketing.
 *
 * The rule that matters: a post is a Flow if it carries a video, whatever its
 * postType claims. Four production rows had a video as their only media while
 * typed 'text', which is exactly how a video ends up in the wrong section.
 *
 * The splitter lives in app/user/[id].tsx, which imports React Native and
 * cannot be loaded in a node test, so the logic is mirrored here. It is six
 * lines; the alternative is no coverage on the one rule that has already been
 * got wrong once.
 */
import { describe, expect, it } from 'vitest';

type Post = {
  id: string;
  postType?: string;
  videoUri?: string | null;
  mediaUris?: string[];
};

function splitProfileSections(echoes: Post[]) {
  const flows = echoes.filter(e => e.postType === 'video' || !!e.videoUri);
  const flowIds = new Set(flows.map(e => e.id));
  const photos = echoes.filter(
    e => !flowIds.has(e.id) && (e.postType === 'photo' || (e.mediaUris?.length ?? 0) > 0),
  );
  return { echoes, photos, flows };
}

const TEXT: Post = { id: 't', postType: 'text' };
const PHOTO: Post = { id: 'p', postType: 'photo', mediaUris: ['a.jpg'] };
const VIDEO: Post = { id: 'v', postType: 'video', videoUri: 'a.mp4' };
/** Typed 'text' but carrying a video — four of these exist in production. */
const MISTYPED_VIDEO: Post = { id: 'm', postType: 'text', videoUri: 'b.mp4' };

describe('Flows', () => {
  it('includes posts typed as video', () => {
    expect(splitProfileSections([VIDEO]).flows.map(e => e.id)).toEqual(['v']);
  });

  it('includes a post carrying a video but typed otherwise', () => {
    // The bug this guards: trusting postType alone hides the post entirely.
    expect(splitProfileSections([MISTYPED_VIDEO]).flows.map(e => e.id)).toEqual(['m']);
  });

  it('excludes text and photo posts', () => {
    expect(splitProfileSections([TEXT, PHOTO]).flows).toHaveLength(0);
  });
});

describe('Photos', () => {
  it('includes posts typed as photo', () => {
    expect(splitProfileSections([PHOTO]).photos.map(e => e.id)).toEqual(['p']);
  });

  it('never claims a video, even one carrying an image list', () => {
    // A post must land in exactly one of Photos and Flows, never both.
    const withBoth: Post = { id: 'x', postType: 'video', videoUri: 'a.mp4', mediaUris: ['t.jpg'] };
    const out = splitProfileSections([withBoth]);
    expect(out.flows.map(e => e.id)).toEqual(['x']);
    expect(out.photos).toHaveLength(0);
  });

  it('excludes plain text posts', () => {
    expect(splitProfileSections([TEXT]).photos).toHaveLength(0);
  });
});

describe('Echoes holds everything', () => {
  it('keeps text posts reachable', () => {
    // Text is 69% of production content. If it is not in Echoes it is nowhere.
    const all = [TEXT, PHOTO, VIDEO, MISTYPED_VIDEO];
    const out = splitProfileSections(all);
    expect(out.echoes).toHaveLength(4);
    expect(out.echoes.map(e => e.id)).toContain('t');
  });

  it('preserves the order it was given', () => {
    const all = [VIDEO, TEXT, PHOTO];
    expect(splitProfileSections(all).echoes.map(e => e.id)).toEqual(['v', 't', 'p']);
  });
});

describe('empty input', () => {
  it('returns empty buckets rather than throwing', () => {
    const out = splitProfileSections([]);
    expect(out.echoes).toEqual([]);
    expect(out.photos).toEqual([]);
    expect(out.flows).toEqual([]);
  });
});
