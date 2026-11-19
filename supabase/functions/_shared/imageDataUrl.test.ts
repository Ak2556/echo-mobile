import { describe, expect, it, vi } from 'vitest';
import { MAX_INLINE_IMAGE_BYTES, bytesToBase64, imageDataUrl } from './imageDataUrl';

const image = (bytes: Uint8Array, type = 'image/png', status = 200) =>
  vi.fn().mockResolvedValue(new Response(bytes, { status, headers: { 'content-type': type } }));

describe('bytesToBase64', () => {
  it('matches the platform encoder, including across chunk boundaries', () => {
    const big = new Uint8Array(0x8000 * 2 + 5).map((_, i) => (i * 31) % 256);
    expect(bytesToBase64(big)).toBe(Buffer.from(big).toString('base64'));
  });
});

describe('imageDataUrl', () => {
  it('inlines the image with its declared type', async () => {
    const url = await imageDataUrl('https://x/a.png', image(new Uint8Array([1, 2, 3])));
    expect(url).toBe('data:image/png;base64,AQID');
  });

  it('treats a generic content type as JPEG, which is what the app uploads', async () => {
    const url = await imageDataUrl('https://x/a', image(new Uint8Array([1]), 'application/octet-stream'));
    expect(url.startsWith('data:image/jpeg;base64,')).toBe(true);
  });

  it('fails on a missing image rather than sending the model nothing', async () => {
    await expect(imageDataUrl('https://x/gone', image(new Uint8Array([1]), 'image/png', 404))).rejects.toThrow('image fetch 404');
    await expect(imageDataUrl('https://x/empty', image(new Uint8Array([])))).rejects.toThrow('image is empty');
  });

  it('refuses an image too large to send inline', async () => {
    await expect(imageDataUrl('https://x/huge', image(new Uint8Array(MAX_INLINE_IMAGE_BYTES + 1)))).rejects.toThrow(/too large/);
  });
});
