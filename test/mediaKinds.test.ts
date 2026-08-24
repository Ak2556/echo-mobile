import { describe, expect, it } from 'vitest';
import { splitMediaForModeration } from '../supabase/functions/embed-echo/mediaKinds';

describe('splitMediaForModeration', () => {
  it('picks out the images a classifier can read', () => {
    const { images, unchecked } = splitMediaForModeration([
      'https://echo-mobile.at3236129.workers.dev/media/echo-media/u/1787481978729_0.jpg',
      'https://eyokhisijabitzjiydmz.supabase.co/storage/v1/object/public/echo-media/u/photo.PNG',
      'https://cdn.example.com/a.webp?width=800',
    ]);

    expect(images).toHaveLength(3);
    expect(unchecked).toEqual([]);
  });

  it('sets video aside instead of sending it to an image model', () => {
    const { images, unchecked } = splitMediaForModeration([
      'https://eyokhisijabitzjiydmz.supabase.co/storage/v1/object/public/echo-media/u/1777626068410_video.mp4',
      'https://echo-mobile.at3236129.workers.dev/media/echo-media/u/clip.m3u8',
      'https://echo-mobile.at3236129.workers.dev/media/echo-media/u/cover.jpg',
    ]);

    expect(images).toEqual(['https://echo-mobile.at3236129.workers.dev/media/echo-media/u/cover.jpg']);
    expect(unchecked).toHaveLength(2);
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
    expect(splitMediaForModeration(null)).toEqual({ images: [], unchecked: [] });
    expect(splitMediaForModeration(undefined)).toEqual({ images: [], unchecked: [] });
    expect(splitMediaForModeration([null, undefined, '', '   '])).toEqual({ images: [], unchecked: [] });
  });
});
