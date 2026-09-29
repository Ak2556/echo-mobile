import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Identity verification decides a badge and holds a biometric selfie, so the
 * contract is pinned where a refactor could quietly loosen it.
 */
const root = resolve(__dirname, '..');
const judge = readFileSync(resolve(root, 'supabase/functions/verify-identity/judge.ts'), 'utf8');
const endpoint = readFileSync(resolve(root, 'supabase/functions/verify-identity/index.ts'), 'utf8');

describe('verification decisions', () => {
  it('only ever decide a request that is still pending', () => {
    expect(judge).toMatch(/\.update\(patch\)\s*\.eq\("id", requestId\)\s*\.eq\("status", "pending"\)/);
    expect(endpoint).toMatch(/\.eq\("id", requestId\)\.eq\("status", "pending"\)\.select\("id"\)/);
  });

  it('queue a retry when the model is unavailable instead of waiting for a human', () => {
    expect(endpoint).toMatch(/outcome\.status === "unavailable"[\s\S]{0,400}rpc\("jobs_enqueue", \{\s*p_queue: "verification"/);
  });

  it('check the storage result when deleting a selfie (remove() does not throw)', () => {
    expect(judge).toMatch(/const \{ error \} = await db\.storage\.from\("verification"\)\.remove\(\[path\]\);\s*if \(error\) throw error;/);
    expect(endpoint).not.toMatch(/\.remove\(\[[^\]]*\]\)\.catch\(/);
  });
});
