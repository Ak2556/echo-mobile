import type { QueryClient } from '@tanstack/react-query';
import { mmkvPersister } from './queryPersister';

/**
 * Wiping the previous user's data off the device at sign-out.
 *
 * Clearing the Zustand stores was never enough. Server data persisted by
 * TanStack Query lives in MMKV, and direct message bodies live in WatermelonDB
 * — neither is encrypted, and neither was touched by SIGNED_OUT. A shared or
 * resold device therefore kept the last account's messages on disk
 * indefinitely.
 *
 * Every step is independently guarded: sign-out must complete even if one of
 * these fails, because a user who cannot sign out is a worse outcome than a
 * cache that outlives the session by one launch.
 */

let queryClient: QueryClient | null = null;

/** Registered from the root layout, which owns the client. Importing the
 *  layout here instead would be circular — it renders the auth listener. */
export function registerQueryClient(client: QueryClient): void {
  queryClient = client;
}

export async function clearLocalUserData(): Promise<void> {
  // In-memory first. Clearing only the persisted copy would let the live cache
  // write itself straight back out.
  try {
    queryClient?.clear();
  } catch { /* a cache that will not clear must not block sign-out */ }

  try {
    await mmkvPersister.removeClient();
  } catch { /* ditto */ }

  try {
    // Required lazily: WatermelonDB pulls a native adapter that throws on
    // import under node, which would take every test in this file's import
    // graph down with it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { database } = require('../src/shared/database');
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  } catch { /* no local DB on this platform, or nothing to reset */ }
}
