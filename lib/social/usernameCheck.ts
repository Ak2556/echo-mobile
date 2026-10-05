/**
 * "Is this handle taken?", cheap to ask repeatedly.
 *
 * The database answers in about 0.1 ms (one index lookup), so what the person
 * waits for is the round trip. This removes the round trips that carry no new
 * information:
 *  - a handle that cannot be valid is answered locally, never sent;
 *  - the same handle asked twice at once shares one request;
 *  - an answer is remembered, so typing a name, deleting a letter and putting it
 *    back is instant. "Taken" is kept for minutes (handles rarely free up);
 *    "available" only briefly, because someone else can claim it any second and
 *    the unique index is the real authority at write time.
 * Errors are never remembered, so a flaky connection does not poison the cache.
 */
import { isValidUsername } from './username';

export interface UsernameCheckerOptions {
  /** Ask the server. Resolves true when the handle is taken by someone else. */
  fetchTaken: (username: string) => Promise<boolean>;
  now?: () => number;
  takenTtlMs?: number;
  availableTtlMs?: number;
}

export interface UsernameChecker {
  /** Resolves true when taken. An invalid handle is reported as taken: it cannot be used. */
  isTaken: (username: string) => Promise<boolean>;
  clear: () => void;
}

export function createUsernameChecker(opts: UsernameCheckerOptions): UsernameChecker {
  const now = opts.now ?? Date.now;
  const takenTtl = opts.takenTtlMs ?? 5 * 60_000;
  const availableTtl = opts.availableTtlMs ?? 30_000;
  const answers = new Map<string, { taken: boolean; at: number }>();
  const inflight = new Map<string, Promise<boolean>>();

  return {
    isTaken(username) {
      const key = username.trim().toLowerCase();
      if (!isValidUsername(key)) return Promise.resolve(true);

      const hit = answers.get(key);
      if (hit && now() - hit.at < (hit.taken ? takenTtl : availableTtl)) return Promise.resolve(hit.taken);

      const pending = inflight.get(key);
      if (pending) return pending;

      const job = opts
        .fetchTaken(key)
        .then((taken) => {
          answers.set(key, { taken, at: now() });
          return taken;
        })
        .finally(() => { inflight.delete(key); });
      inflight.set(key, job);
      return job;
    },
    clear() {
      answers.clear();
      inflight.clear();
    },
  };
}
