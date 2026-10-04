import { describe, it, expect } from 'vitest';
import { filterModeratedPosts } from './feedFilter';

interface SamplePost {
  id: string;
  title: string;
  flagged?: boolean | null;
  checkContent?: boolean | null;
}

const safe: SamplePost = { id: 'a', title: 'Welcome', flagged: false, checkContent: true };
const flagged: SamplePost = { id: 'b', title: 'Naughty', flagged: true, checkContent: true };
const unmoderated: SamplePost = { id: 'c', title: 'Pending', flagged: false, checkContent: false };
const unknown: SamplePost = { id: 'd', title: 'Legacy' }; // no moderation fields

describe('filterModeratedPosts', () => {
  it('keeps safe, moderation-passed posts', () => {
    const out = filterModeratedPosts([safe]);
    expect(out).toEqual([safe]);
  });

  it('drops posts where flagged=true regardless of check_content', () => {
    const out = filterModeratedPosts([safe, flagged]);
    expect(out.map((p) => p.id)).toEqual(['a']);
  });

  it('drops posts with checkContent=false (never moderated)', () => {
    const out = filterModeratedPosts([safe, unmoderated]);
    expect(out.map((p) => p.id)).toEqual(['a']);
  });

  it('passes through legacy posts that lack moderation fields entirely', () => {
    // Legacy rows pre-migration don't have either flag; we treat them
    // as safe so the feed isn't accidentally empty after deploy.
    const out = filterModeratedPosts([unknown]);
    expect(out.map((p) => p.id)).toEqual(['d']);
  });

  it('returns an empty array when given an empty array (no crash)', () => {
    const out = filterModeratedPosts([] as SamplePost[]);
    expect(out).toEqual([]);
  });

  it('preserves input order', () => {
    const out = filterModeratedPosts([safe, flagged, unknown, unmoderated]);
    expect(out.map((p) => p.id)).toEqual(['a', 'd']);
  });
});
