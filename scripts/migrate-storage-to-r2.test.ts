import { describe, expect, it } from 'vitest';
import { BUCKETS, PUBLIC_READ_BUCKETS, downloadUrl } from './migrate-storage-to-r2.mjs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The backfill must reach every bucket the app now reads from R2, including the
 * two private ones. A public download URL fails for those, which is why it
 * reads through the authenticated endpoint.
 */
describe('migrate-storage-to-r2', () => {
  it('copies every R2-backed bucket the app reads, and not verification', () => {
    expect([...BUCKETS].sort()).toEqual(['avatars', 'dm-media', 'echo-media', 'marketplace-photos', 'mini-app-media']);
    expect(BUCKETS).not.toContain('verification');
  });

  it('has an R2 binding for every bucket it copies', () => {
    const toml = readFileSync(resolve(__dirname, '..', 'wrangler.toml'), 'utf8');
    for (const bucket of BUCKETS) expect(toml).toContain(`bucket_name = "${bucket}"`);
  });

  it('only checks public buckets through the public /media route', () => {
    expect([...PUBLIC_READ_BUCKETS].sort()).toEqual(['avatars', 'echo-media', 'marketplace-photos']);
  });

  it('downloads through the authenticated endpoint, encoding each segment', () => {
    expect(downloadUrl('https://x.supabase.co', 'dm-media', 'u1/conv 1/a#b.jpg'))
      .toBe('https://x.supabase.co/storage/v1/object/authenticated/dm-media/u1/conv%201/a%23b.jpg');
  });
});
