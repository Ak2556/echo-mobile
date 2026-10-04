/**
 * A comment resend must not post twice. The online insert runs under a 20 s
 * timeout that abandons the wait, not the insert, and the compose screen
 * keeps the draft on failure, so the resend is the common case after a slow
 * network. It reuses the failed attempt's id; a duplicate on that id means the
 * first attempt landed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// echo_comments' primary key.
const landed = new Set<string>();
let nextError: { code: string; message: string } | null = null;
const inserted: Record<string, unknown>[] = [];

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u-me' } } }, error: null }) },
    from: () => ({
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            inserted.push(row);
            if (nextError) { const error = nextError; nextError = null; return { data: null, error }; }
            const id = (row.id as string) ?? `server-${inserted.length}`;
            if (landed.has(id)) return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "echo_comments_pkey"' } };
            landed.add(id);
            return { data: { id }, error: null };
          },
        }),
      }),
    }),
  },
}));
vi.mock('expo-file-system/legacy', () => ({ EncodingType: {}, FileSystemUploadType: {}, readAsStringAsync: vi.fn(), uploadAsync: vi.fn() }));

import { insertRemoteComment } from '../lib/supabaseEchoApi';
import { commentRetryKey, createRetryIds } from '../lib/core/retryIds';

beforeEach(() => { landed.clear(); inserted.length = 0; nextError = null; });

describe('insertRemoteComment with a client id', () => {
  const ID = '7a1c0000-0000-4000-8000-000000000001';

  it('a resend after the first attempt landed counts as sent, not a second comment', async () => {
    await insertRemoteComment('echo-1', 'nice', undefined, ID); // landed; client timed out
    await expect(insertRemoteComment('echo-1', 'nice', undefined, ID)).resolves.toBeUndefined();
    expect(landed.size).toBe(1);
  });

  it('without a client id a duplicate is still an error', async () => {
    nextError = { code: '23505', message: 'duplicate key' };
    await expect(insertRemoteComment('echo-1', 'nice')).rejects.toMatchObject({ code: '23505' });
  });

  it('any other failure still throws', async () => {
    nextError = { code: '42501', message: 'row-level security' };
    await expect(insertRemoteComment('echo-1', 'nice', undefined, ID)).rejects.toMatchObject({ code: '42501' });
  });
});

describe('createRetryIds', () => {
  let n = 0;
  const ids = () => createRetryIds(() => `id-${++n}`);

  it('a resend of the same comment gets the same id until it succeeds', () => {
    const reg = ids();
    const key = commentRetryKey('echo-1', 'on my way');
    const first = reg.claim(key);
    expect(reg.claim(key)).toBe(first);   // failed → resend
    reg.settle(key);                      // it went through
    expect(reg.claim(key)).not.toBe(first); // saying it again later is a new comment
  });

  it('a different text, echo or reply target is a different comment', () => {
    const reg = ids();
    const a = reg.claim(commentRetryKey('echo-1', 'yes'));
    expect(reg.claim(commentRetryKey('echo-1', 'yes!'))).not.toBe(a);
    expect(reg.claim(commentRetryKey('echo-2', 'yes'))).not.toBe(a);
    expect(reg.claim(commentRetryKey('echo-1', 'yes', 'c-9'))).not.toBe(a);
  });
});

describe('wiring', () => {
  const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

  it('the outbox replays a queued comment under the id the online attempt used', () => {
    expect(read('lib/core/outboxProcessor.ts')).toMatch(/insertRemoteComment\(p\.echoId, p\.content, p\.parentId, p\.clientId \?\? opId\)/);
  });

  it('the comment hook sends the held id online and offline', () => {
    const src = read('hooks/queries/useEchoComments.ts');
    expect(src).toMatch(/insertRemoteComment\(echoId, arg\.content, arg\.parentId, clientId\)/);
    expect(src).toMatch(/outbox\.enqueue\('comment', \{ echoId, content: arg\.content, parentId: arg\.parentId, clientId \}\)/);
  });

  it('share keeps the remix context until the publish succeeds', () => {
    const src = read('app/share.tsx');
    const publish = src.slice(src.indexOf('await remotePublish.mutateAsync') - 400);
    expect(publish).toMatch(/const ctx = peekPendingPublishContext\(\);/);
    expect(publish.indexOf('consumePendingPublishContext();')).toBeGreaterThan(publish.indexOf('await remotePublish.mutateAsync'));
  });

  it('both composers reuse one post id per draft', () => {
    expect(read('app/create-post.tsx')).toMatch(/draftEchoIdRef\.current \?\?= Crypto\.randomUUID\(\)/);
    expect(read('app/share.tsx')).toMatch(/id: \(draftEchoIdRef\.current \?\?= randomUUID\(\)\)/);
  });
});
