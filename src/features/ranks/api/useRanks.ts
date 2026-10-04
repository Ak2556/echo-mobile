import { useQuery } from '@tanstack/react-query';
import { fetchAuthorRanks, fetchMyRank, type AuthorRank } from '../../../../lib/supabaseEchoApi';
import { isSupabaseRemote } from '../../../../lib/core/remoteConfig';

/** Your own rank, live, so a new post moves the bar straight away. */
export function useMyRank() {
  return useQuery({
    queryKey: ['rank', 'me'],
    queryFn: fetchMyRank,
    enabled: isSupabaseRemote(),
    staleTime: 60_000,
  });
}

// Feed and comment cards render one at a time, so each asks for its own
// author's tier. Asks made within one tick are collected into a single
// profiles query instead of one request per card.
type Waiter = { resolve: (v: AuthorRank | null) => void; reject: (e: unknown) => void };
let pending = new Map<string, Waiter[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  const batch = pending;
  pending = new Map();
  timer = null;
  try {
    const ranks = await fetchAuthorRanks([...batch.keys()]);
    for (const [id, waiters] of batch) for (const w of waiters) w.resolve(ranks[id] ?? null);
  } catch (e) {
    for (const waiters of batch.values()) for (const w of waiters) w.reject(e);
  }
}

export function loadAuthorRank(id: string): Promise<AuthorRank | null> {
  return new Promise((resolve, reject) => {
    const list = pending.get(id) ?? [];
    list.push({ resolve, reject });
    pending.set(id, list);
    if (!timer) timer = setTimeout(() => { void flush(); }, 30);
  });
}

/** Another person's stored tier. Lags their real rank by up to an hour. */
export function useAuthorRank(userId: string | null | undefined) {
  return useQuery({
    queryKey: ['rank', 'author', userId],
    queryFn: () => loadAuthorRank(userId!),
    enabled: !!userId && userId !== 'me' && isSupabaseRemote(),
    staleTime: 30 * 60_000,
  });
}
