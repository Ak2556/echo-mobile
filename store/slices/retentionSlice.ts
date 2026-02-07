import { persistGet, persistSet } from '../persist';

// Retention state: XP, current streak, last active day. MMKV-persisted so
// state survives app restart. Lib helpers in `lib/retention.ts` consume
// this and components subscribe via the `useRetention()` hook.

export interface RetentionSlice {
  xp: number;
  lastActiveDay: string | null;
  streakDays: number;

  addXp: (delta: number) => void;
  setLastActiveDay: (day: string) => void;
  setStreakDays: (n: number) => void;
  resetRetention: () => void;
}

export function createRetentionSlice(
  set: (partial: object) => void,
  get: () => RetentionSlice,
): RetentionSlice {
  return {
    xp:             persistGet<number>('retention.xp', 0),
    lastActiveDay:  persistGet<string | null>('retention.lastActiveDay', null),
    streakDays:     persistGet<number>('retention.streakDays', 0),

    addXp: (delta) => {
      const next = Math.max(0, get().xp + delta);
      persistSet('retention.xp', next);
      set({ xp: next });
    },
    setLastActiveDay: (day) => {
      persistSet('retention.lastActiveDay', day);
      set({ lastActiveDay: day });
    },
    setStreakDays: (n) => {
      persistSet('retention.streakDays', n);
      set({ streakDays: n });
    },
    resetRetention: () => {
      persistSet('retention.xp', 0);
      persistSet('retention.lastActiveDay', null);
      persistSet('retention.streakDays', 0);
      set({ xp: 0, lastActiveDay: null, streakDays: 0 });
    },
  };
}
