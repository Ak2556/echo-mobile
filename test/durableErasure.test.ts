import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Account deletion is a legal obligation, so its ordering is pinned: record
 * the request durably before deleting anything, delete files before the rows
 * that say whose they are, and reach Supabase Storage as well as R2.
 */
const root = resolve(__dirname, '..');
const endpoint = readFileSync(resolve(root, 'supabase/functions/delete-account/index.ts'), 'utf8');
const erasure = readFileSync(resolve(root, 'supabase/functions/delete-account/erasure.ts'), 'utf8');

describe('account erasure', () => {
  it('records the request (and queues it) before deleting anything', () => {
    expect(endpoint.indexOf("rpc('request_erasure'")).toBeGreaterThan(-1);
    expect(endpoint.indexOf("rpc('request_erasure'")).toBeLessThan(endpoint.indexOf('runErasure(admin'));
  });

  it('purges files before deleting the rows that identify them', () => {
    const run = erasure.slice(erasure.indexOf('export async function runErasure'));
    expect(run.indexOf('purgeR2(userId)')).toBeLessThan(run.indexOf("rpc('erase_account_rows'"));
    expect(run.indexOf('purgeStorage(db, userId)')).toBeLessThan(run.indexOf("rpc('erase_account_rows'"));
  });

  it('treats a partial R2 purge as a failed step', () => {
    expect(erasure).toMatch(/if \(res\.status !== 200\) throw/);
  });

  it('reaches the legacy Storage buckets, including DM media and selfies', () => {
    for (const bucket of ['dm-media', 'verification', 'avatars', 'echo-media', 'marketplace-photos']) {
      expect(erasure).toContain(`'${bucket}'`);
    }
  });
});
