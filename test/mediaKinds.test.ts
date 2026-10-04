import { describe, expect, it } from 'vitest';
import { splitHttpUrls, splitMediaForModeration } from '../supabase/functions/embed-echo/mediaKinds';

describe('splitMediaForModeration', () => {
  it('picks out the images a classifier can read', () => {
    const { images, videos, unchecked } = splitMediaForModeration([
      'https://echo-mobile.at3236129.workers.dev/media/echo-media/u/1787481978729_0.jpg',
      'https://eyokhisijabitzjiydmz.supabase.co/storage/v1/object/public/echo-media/u/photo.PNG',
      'https://cdn.example.com/a.webp?width=800',
    ]);

    expect(images).toHaveLength(3);
    expect(videos).toEqual([]);
    expect(unchecked).toEqual([]);
  });

  it('sets video aside instead of sending it to an image model', () => {
    const { images, videos, unchecked } = splitMediaForModeration([
      'https://eyokhisijabitzjiydmz.supabase.co/storage/v1/object/public/echo-media/u/1777626068410_video.mp4',
      'https://echo-mobile.at3236129.workers.dev/media/echo-media/u/clip.m3u8',
      'https://echo-mobile.at3236129.workers.dev/media/echo-media/u/cover.jpg',
    ]);

    expect(images).toEqual(['https://echo-mobile.at3236129.workers.dev/media/echo-media/u/cover.jpg']);
    // An mp4 goes to the video gate; an HLS manifest is not something Gemini reads.
    expect(videos).toEqual(['https://eyokhisijabitzjiydmz.supabase.co/storage/v1/object/public/echo-media/u/1777626068410_video.mp4']);
    expect(unchecked).toEqual(['https://echo-mobile.at3236129.workers.dev/media/echo-media/u/clip.m3u8']);
  });

  it('treats an extensionless URL as unchecked rather than guessing', () => {
    const { images, unchecked } = splitMediaForModeration(['https://cdn.example.com/asset/9f2b1c']);

    expect(images).toEqual([]);
    expect(unchecked).toHaveLength(1);
  });

  it('never passes a non-http URL to the classifier', () => {
    const { images, unchecked } = splitMediaForModeration([
      'data:image/png;base64,iVBORw0KGgo=',
      'file:///var/mobile/tmp/x.jpg',
    ]);

    expect(images).toEqual([]);
    expect(unchecked).toHaveLength(2);
  });

  it('shrugs off empty and malformed input', () => {
    expect(splitMediaForModeration(null)).toEqual({ images: [], videos: [], unchecked: [] });
    expect(splitMediaForModeration(undefined)).toEqual({ images: [], videos: [], unchecked: [] });
    expect(splitMediaForModeration([null, undefined, '', '   '])).toEqual({ images: [], videos: [], unchecked: [] });
  });
});

describe('splitHttpUrls', () => {
  it('keeps http(s) URLs whatever their extension, as avatars from sign-in providers have none', () => {
    const { fetchable, unfetchable } = splitHttpUrls([
      'https://lh3.googleusercontent.com/a/ACg8ocJxyz=s96-c',
      'https://echo-mobile.at3236129.workers.dev/media/avatars/u/avatar.jpg?v=3',
      ' http://cdn.example.com/p.png ',
    ]);
    expect(fetchable).toHaveLength(3);
    expect(fetchable[2]).toBe('http://cdn.example.com/p.png');
    expect(unfetchable).toEqual([]);
  });

  it('sets aside what a model cannot fetch, instead of dropping it', () => {
    const { fetchable, unfetchable } = splitHttpUrls([
      'data:image/png;base64,iVBORw0KGgo=',
      'file:///var/mobile/tmp/x.jpg',
      'not a url',
    ]);
    expect(fetchable).toEqual([]);
    expect(unfetchable).toHaveLength(3);
  });

  it('shrugs off empty and malformed input', () => {
    expect(splitHttpUrls(null)).toEqual({ fetchable: [], unfetchable: [] });
    expect(splitHttpUrls([null, undefined, '', '  '])).toEqual({ fetchable: [], unfetchable: [] });
  });
});
