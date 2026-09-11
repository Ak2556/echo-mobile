import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_EDGE, resizeForUpload } from './imageUploadPrep';

describe('resizeForUpload', () => {
  it('caps the width of a landscape photo', () => {
    expect(resizeForUpload(8064, 6048, MAX_UPLOAD_EDGE.post)).toEqual({ width: 1600 });
  });

  it('caps the height of a portrait photo', () => {
    expect(resizeForUpload(3024, 4032, MAX_UPLOAD_EDGE.post)).toEqual({ height: 1600 });
  });

  it('caps a square avatar by width', () => {
    expect(resizeForUpload(3000, 3000, MAX_UPLOAD_EDGE.avatar)).toEqual({ width: 512 });
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
