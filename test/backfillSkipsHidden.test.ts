import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * embed-echo never embeds a post moderation hid (check_content = false). The
 * backfill tool selected every post with no embedding, so its first run on
 * 2026-11-19 would have embedded one hidden post. Both of its queries must
 * carry the same filter as the feed.
 */
describe('backfill-embeddings', () => {
  it('only selects and counts posts the feed may show', () => {
    const src = readFileSync(resolve(__dirname, '../supabase/functions/backfill-embeddings/index.ts'), 'utf8');
    const queries = src.split('.from("public_echoes")').slice(1);
    expect(queries.length).toBeGreaterThanOrEqual(2);
    const selectsMissing = queries.filter(q => {
      const head = q.slice(0, 400);
      return head.includes('.is("embedding", null)') && !head.includes('.eq("check_content", true)');
    });
    expect(selectsMissing).toEqual([]);
  });
});
