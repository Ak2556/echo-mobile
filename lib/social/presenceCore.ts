import { create } from 'zustand';

/** What `get_presence` returns for one person. `last_active` is a code, never a timestamp. */
export type LastActive = 'recent' | 'today' | 'yesterday' | 'this_week';
export interface PresenceRow { user_id: string; online: boolean; last_active: LastActive | null }
export interface PresenceEntry { online: boolean; lastActive: LastActive | null }

export const HEARTBEAT_MS = 60_000;
export const POLL_MS = 45_000;
export const MAX_IDS = 50;

interface PresenceState {
  byUser: Record<string, PresenceEntry>;
  apply: (rows: PresenceRow[]) => void;
  clear: () => void;
}

/** The latest answer from the server, keyed by user id. Not persisted: presence is only ever "now". */
export const usePresenceStore = create<PresenceState>(set => ({
  byUser: {},
  apply: rows => set(state => {
    const next = { ...state.byUser };
    for (const row of rows) next[row.user_id] = { online: row.online, lastActive: row.last_active ?? null };
    return { byUser: next };
  }),
  clear: () => set({ byUser: {} }),
}));

const PHRASES: Record<LastActive, string> = {
  recent: 'Active recently',
  today: 'Active today',
  yesterday: 'Active yesterday',
  this_week: 'Active this week',
};

/**
 * The English phrase for a person's presence, or null when there is nothing to say. Callers pass it
 * through ttx(): the keys here are the translation keys.
 */
export function presencePhrase(entry: PresenceEntry | undefined): string | null {
  if (!entry) return null;
  if (entry.online) return 'Active now';
  return entry.lastActive ? PHRASES[entry.lastActive] : null;
}

/** Pings `ping` now and then every `intervalMs` until stopped. A failed ping is ignored: the next one retries. */
export function createHeartbeat(ping: () => Promise<unknown>, intervalMs = HEARTBEAT_MS) {
  let timer: ReturnType<typeof setInterval> | null = null;
  const tick = () => { void ping().catch(() => {}); };
  return {
    start() {
      if (timer) return;
      tick();
      timer = setInterval(tick, intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    get running() { return timer !== null; },
  };
}

/**
 * Asks for `ids` now and then every `intervalMs`, handing each answer to `apply`. Presence is
 * decoration: a failed poll leaves the last answer in place and never throws. Returns a stop function;
 * an answer that arrives after stop() is dropped.
 */
export function startPresencePolling(
  ids: string[],
  fetchRows: (ids: string[]) => Promise<PresenceRow[]>,
  apply: (rows: PresenceRow[]) => void,
  intervalMs = POLL_MS,
): () => void {
  let stopped = false;
  const run = async () => {
    try {
      const rows = await fetchRows(ids);
      if (!stopped) apply(rows);
    } catch {
      // keep what we have
    }
  };
  void run();
  const timer = setInterval(run, intervalMs);
  return () => { stopped = true; clearInterval(timer); };
}

/** The ids worth asking about: unique, not me, sorted (a stable key), at most MAX_IDS. */
export function presenceIdKey(ids: (string | null | undefined)[], me: string | null | undefined): string {
  const clean = Array.from(new Set(ids.filter((id): id is string => !!id && id !== me))).sort();
  return clean.slice(0, MAX_IDS).join(',');
}
