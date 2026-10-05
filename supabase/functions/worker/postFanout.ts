// Expand one post into notifications for its followers, a batch at a time.
// Pure (no Deno or esm.sh imports) so vitest can run it; handlers.ts supplies the
// two database calls.
//
// Each batch is one INSERT ... SELECT on the server (fanout_friend_post_batch)
// and a keyset cursor, so the cost per batch is constant however many followers
// the author has. When the time budget runs out the rest is queued as a new job
// carrying the cursor, so no single invocation can run past the platform limit.
// Retrying a job from its original cursor is safe: the server inserts with
// ON CONFLICT DO NOTHING against a unique (user, echo) index.

export const POST_FANOUT_BATCH = 500;
/** Stay well inside an edge function's wall-clock limit. */
export const POST_FANOUT_BUDGET_MS = 20_000;

export interface PostFanoutDeps {
  /** One batch. Resolves the last follower id when the batch was full, null when done. */
  batch: (echoId: string, after: string | null, limit: number) => Promise<string | null>;
  /** Queue the remainder, starting after this follower. */
  continueFrom: (echoId: string, cursor: string) => Promise<void>;
  now?: () => number;
  budgetMs?: number;
  batchSize?: number;
}

export async function runPostFanout(
  echoId: string,
  startCursor: string | null,
  deps: PostFanoutDeps,
): Promise<{ batches: number; finished: boolean }> {
  const now = deps.now ?? Date.now;
  const budget = deps.budgetMs ?? POST_FANOUT_BUDGET_MS;
  const size = deps.batchSize ?? POST_FANOUT_BATCH;
  const started = now();
  let cursor = startCursor;
  let batches = 0;
  for (;;) {
    const next = await deps.batch(echoId, cursor, size);
    batches++;
    if (!next) return { batches, finished: true };
    cursor = next;
    if (now() - started >= budget) {
      await deps.continueFrom(echoId, cursor);
      return { batches, finished: false };
    }
  }
}
