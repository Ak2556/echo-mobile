import { describe, it, expect } from 'vitest';
import { extractHashtags, mapEchoRowToFeedItem, SupabaseEchoRow, SupabaseProfileRow } from './mapSupabaseEcho';

describe('extractHashtags', () => {
  it('dedupes repeated tags', () => {
    expect(extractHashtags('Hello #Echo #Echo')).toEqual(['#Echo']);
  });

  it('returns empty for none', () => {
    expect(extractHashtags('no tags')).toEqual([]);
  });
});

describe('mapEchoRowToFeedItem', () => {
  const echo: SupabaseEchoRow = {
    id: 'e1',
    author_id: 'u1',
    title: 't',
    prompt: 'p',
    response: 'r',
    likes_count: 3,
    comment_count: 1,
    repost_count: 2,
    view_count: 10,
    created_at: new Date().toISOString(),
    media_urls: ['https://x/a.jpg'],
  };

  const author: SupabaseProfileRow = {
    id: 'u1',
    username: 'alice',
    display_name: 'Alice',
    avatar_color: '#111',
    is_verified: true,
    created_at: new Date().toISOString(),
  };

  it('maps liked, bookmarked, reposted flags from sets', () => {
    const item = mapEchoRowToFeedItem(
      echo,
      author,
      new Set(['e1']),
      new Set(),
      new Set(['e1'])
    );
    expect(item.isLiked).toBe(true);
    expect(item.isBookmarked).toBe(false);
    expect(item.isReposted).toBe(true);
    expect(item.repostCount).toBe(2);
    expect(item.postType).toBe('photo');
  });

  it('defaults media when absent', () => {
    const textEcho = { ...echo, media_urls: null };
    const item = mapEchoRowToFeedItem(textEcho, author, new Set(), new Set(), new Set());
    expect(item.postType).toBe('text');
    expect(item.mediaUris).toBeUndefined();
  });

  it('maps video media urls to video posts', () => {
    const videoEcho = { ...echo, media_urls: ['https://x/video.mp4'] };
    const item = mapEchoRowToFeedItem(videoEcho, author, new Set(), new Set(), new Set());
    expect(item.postType).toBe('video');
    expect(item.videoUri).toBe('https://x/video.mp4');
    expect(item.mediaUris).toBeUndefined();
  });

  it('maps video/x-m4v media urls to video posts', () => {
    const videoEcho = { ...echo, media_urls: ['https://x/video.x-m4v'] };
    const item = mapEchoRowToFeedItem(videoEcho, author, new Set(), new Set(), new Set());
    expect(item.postType).toBe('video');
    expect(item.videoUri).toBe('https://x/video.x-m4v');
  });

  it('maps extensionless storage urls with video mime hints to video posts', () => {
    const videoEcho = { ...echo, media_urls: ['https://x/object?id=1&contentType=video%2Fmp4'] };
    const item = mapEchoRowToFeedItem(videoEcho, author, new Set(), new Set(), new Set());
    expect(item.postType).toBe('video');
    expect(item.videoUri).toBe('https://x/object?id=1&contentType=video%2Fmp4');
  });
});
