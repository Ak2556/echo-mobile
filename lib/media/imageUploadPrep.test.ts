import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { centerSquareCrop, isHeicUri, MAX_UPLOAD_EDGE, resizeForUpload } from './imageUploadPrep';

describe('resizeForUpload', () => {
  it('caps the width of a landscape photo', () => {
    expect(resizeForUpload(8064, 6048, MAX_UPLOAD_EDGE.post)).toEqual({ width: 1600 });
  });

  it('caps the height of a portrait photo', () => {
    expect(resizeForUpload(3024, 4032, MAX_UPLOAD_EDGE.post)).toEqual({ height: 1600 });
  });

  it('caps a square avatar by width', () => {
    expect(resizeForUpload(3000, 3000, MAX_UPLOAD_EDGE.avatar)).toEqual({ width: 1080 });
  });

  it('leaves an image that already fits alone', () => {
    expect(resizeForUpload(1600, 900, MAX_UPLOAD_EDGE.post)).toBeNull();
    expect(resizeForUpload(400, 400, MAX_UPLOAD_EDGE.avatar)).toBeNull();
  });

  it('refuses to guess when the size is unknown', () => {
    expect(resizeForUpload(0, 4032, MAX_UPLOAD_EDGE.post)).toBeNull();
    expect(resizeForUpload(Number.NaN, 4032, MAX_UPLOAD_EDGE.post)).toBeNull();
  });
});

// 2026-11-25: the iPhone picker passes HEIC through; Android and the web cannot show it.
describe('isHeicUri', () => {
  it('recognises the picker HEIC and HEIF files', () => {
    expect(isHeicUri('file:///x/Library/Caches/ImagePicker/5C1D.heic')).toBe(true);
    expect(isHeicUri('file:///x/IMG_1.HEIF')).toBe(true);
  });

  it('leaves JPEG and PNG alone', () => {
    expect(isHeicUri('file:///x/a.jpg')).toBe(false);
    expect(isHeicUri('file:///x/heic-notes.png')).toBe(false);
  });
});

// 2026-11-26: a tester saw their profile photo pixelated. Avatars were capped at
// 512 px with no square crop, so a portrait photo was 384 px wide and the
// full-screen viewer stretched it 3.4x across an iPhone.
describe('avatar upload size', () => {
  it('keeps enough pixels for the full-screen photo viewer', () => {
    expect(MAX_UPLOAD_EDGE.avatar).toBeGreaterThanOrEqual(1080);
  });

  it('crops a portrait photo to its centred square', () => {
    expect(centerSquareCrop(3024, 4032)).toEqual({ originX: 0, originY: 504, width: 3024, height: 3024 });
  });

  it('crops a landscape photo to its centred square', () => {
    expect(centerSquareCrop(4032, 3024)).toEqual({ originX: 504, originY: 0, width: 3024, height: 3024 });
  });

  it('leaves a square or unknown size alone', () => {
    expect(centerSquareCrop(1080, 1080)).toBeNull();
    expect(centerSquareCrop(0, 1080)).toBeNull();
  });

  it('is what uploadAvatar asks for', () => {
    const api = readFileSync('lib/supabaseEchoApi.ts', 'utf8');
    expect(api).toMatch(/prepareImageUpload\(picked, MAX_UPLOAD_EDGE\.avatar, \{ square: true \}\)/);
  });
});
