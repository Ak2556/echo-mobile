// Account erasure as a resumable sequence of idempotent steps.
//
//   requested     -> purge the user's files from R2 and from Supabase Storage
//   media_purged  -> delete the account rows and the auth user
//   done
//
// The state is stored (erasure_requests) before anything is deleted, and each
// step is safe to repeat: purging an empty prefix deletes nothing, and
// erasing an account that is already gone is a no-op. The delete-account
// endpoint runs this inline, so the normal case finishes before it answers;
// if a step fails, the 'erasure' job it queued first keeps retrying it from
// the step it reached. Deletion used to be one request: a failure after the
// media purge ended in "contact support" with the account half-erased.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// deno-lint-ignore no-explicit-any
type Db = SupabaseClient<any, any, any>;

export type ErasureState = 'requested' | 'media_purged' | 'done';

/**
 * Supabase Storage buckets that may hold a user's files under their id: media
 * written before the move to R2 (dm-media most of all) and verification
 * selfies. delete_account() tried to delete these with SQL, which Supabase
 * disallows, and swallowed the error, so they outlived the account.
 */
const STORAGE_BUCKETS = ['avatars', 'echo-media', 'dm-media', 'marketplace-photos', 'verification'];

async function purgeR2(userId: string): Promise<void> {
  const workerUrl = (Deno.env.get('CLOUDFLARE_WORKER_URL') ?? '').replace(/\/$/, '');
  const secret = Deno.env.get('PURGE_SECRET') ?? '';
  if (!workerUrl || !secret) throw new Error('R2 purge is not configured (CLOUDFLARE_WORKER_URL, PURGE_SECRET)');
  const res = await fetch(`${workerUrl}/purge-user`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Purge-Secret': secret },
    body: JSON.stringify({ user_id: userId }),
  });
  // 207: some buckets failed. A partial purge is a failed step; it is retried.
  if (res.status !== 200) throw new Error(`R2 purge answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/** Every object path under `prefix`, descending into folders. */
async function listAll(db: Db, bucket: string, prefix: string): Promise<string[] | null> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) {
      if (/not found/i.test(error.message)) return null; // no such bucket on this project
      throw error;
    }
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`;
      if (item.id === null) {
        const nested = await listAll(db, bucket, path);
        if (nested) out.push(...nested);
      } else {
        out.push(path);
      }
    }
    if (!data || data.length < 1000) return out;
  }
}

async function purgeStorage(db: Db, userId: string): Promise<void> {
  for (const bucket of STORAGE_BUCKETS) {
    const paths = await listAll(db, bucket, userId);
    if (!paths?.length) continue;
    for (let i = 0; i < paths.length; i += 1000) {
      const { error } = await db.storage.from(bucket).remove(paths.slice(i, i + 1000));
      if (error) throw new Error(`storage purge of ${bucket} failed: ${error.message}`);
    }
  }
}

async function advance(db: Db, userId: string, state: ErasureState): Promise<ErasureState> {
  const { error } = await db
    .from('erasure_requests')
    .update({ state, updated_at: new Date().toISOString(), last_error: null })
    .eq('user_id', userId);
  if (error) throw error;
  return state;
}

/** Run the erasure forward from wherever it stopped. Throws to be retried. */
export async function runErasure(db: Db, userId: string): Promise<ErasureState> {
  const { data, error } = await db.from('erasure_requests').select('state').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  let state = (data?.state ?? 'done') as ErasureState;
  try {
    if (state === 'requested') {
      await purgeR2(userId);
      await purgeStorage(db, userId);
      state = await advance(db, userId, 'media_purged');
    }
    if (state === 'media_purged') {
      const { error: eraseErr } = await db.rpc('erase_account_rows', { p_user: userId });
      if (eraseErr) throw eraseErr;
      state = await advance(db, userId, 'done');
    }
    return state;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from('erasure_requests').update({ last_error: message.slice(0, 1000), updated_at: new Date().toISOString() }).eq('user_id', userId);
    throw e;
  }
}
