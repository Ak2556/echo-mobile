import { defaultShouldDehydrateQuery, type Query } from '@tanstack/react-query';

/**
 * What the offline query cache may write to disk.
 *
 * The cache is saved to MMKV as plain JSON (lib/core/queryPersister.ts) and
 * restored on the next launch. `['messages', conversationId]` is filled by
 * fetchRemoteMessages, which decrypts end-to-end encrypted direct messages
 * while it fetches, so persisting that query left the plaintext of every
 * recent DM on disk, and in any device backup, for up to a week. lib/e2ee/cache.ts
 * keeps decrypted text in memory only for exactly this reason; the query cache
 * quietly undid it.
 *
 * A thread is simply fetched again when it is opened. Nothing else needs a
 * rule: other queries hold data the server already shows to the same reader.
 */
const NEVER_PERSIST_ROOTS: ReadonlySet<string> = new Set(['messages']);

/**
 * Change this string to throw away every device's saved cache once. The
 * persist provider drops a saved cache whose buster differs, which is how
 * plaintext written by earlier versions gets removed on the first launch after
 * this ships, without a code path of its own to forget about.
 */
export const PERSIST_BUSTER = 'no-dm-plaintext-1';

export function shouldPersistQuery(query: Pick<Query, 'queryKey' | 'state'>): boolean {
  const root = query.queryKey[0];
  if (typeof root === 'string' && NEVER_PERSIST_ROOTS.has(root)) return false;
  return defaultShouldDehydrateQuery(query as Query);
}
