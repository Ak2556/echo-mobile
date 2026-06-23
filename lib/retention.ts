// Retention layer: streaks + XP + levels.
//
// Local-only for v1 (MMKV-persisted via the existing store slice). The goal
// isn't a leaderboard — it's giving users a daily reason to come back and a
// visible reward loop for the actions that grow the network (publishing,
// remixing, receiving remixes on your work).

import { useAppStore } from '../store/useAppStore';

// XP rewarded per action. Tuned so a casual user can hit Level 5 in a week
// of light activity; a power user can hit Level 10 in a month.
export const XP_REWARDS = {
  publishEcho:     50,
  publishRemix:    30, // remixer gets a bit less than original publish
  receiveRemix:    20, // parent author when someone remixes them
  receiveLike:      2,
  receiveComment:   5,
  dailyActiveBonus: 10,
  // Streak milestone bonuses (one-shot, awarded on entering the day)
  streakDay3:       25,
  streakDay7:       75,
  streakDay14:    150,
  streakDay30:    400,
} as const;

export type XpAction = keyof typeof XP_REWARDS;

// Level curve: 100 * level^1.5.
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(100 * Math.pow(level - 1, 1.5));
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export function progressInLevel(xp: number): {
  level: number;
  xpInLevel: number;
  xpToNext: number;
  pct: number;
} {
  const level = levelForXp(xp);
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  const span = Math.max(ceil - floor, 1);
  const xpInLevel = xp - floor;
  return {
    level,
    xpInLevel,
    xpToNext: ceil - xp,
    pct: Math.min(1, xpInLevel / span),
  };
}

export function levelTitle(level: number): string {
  if (level >= 30) return 'Architect';
  if (level >= 20) return 'Composer';
  if (level >= 15) return 'Conductor';
  if (level >= 10) return 'Curator';
  if (level >= 7)  return 'Catalyst';
  if (level >= 5)  return 'Voice';
  if (level >= 3)  return 'Sketcher';
  return 'Seedling';
}

// Streak math
function dayKey(d: Date): string {
  // YYYY-MM-DD in local time. We don't try to be timezone-clever; matching
  // the user's local "day" feels right for a daily-streak product.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/**
 * Returns the next streak count given the previous activity day.
 *   - Same day: unchanged
 *   - Yesterday: +1
 *   - Older: reset to 1
 */
export function nextStreak(prevDayKey: string | null, prevStreak: number, today = new Date()): number {
  const todayKey = dayKey(today);
  if (!prevDayKey) return 1;
  const gap = daysBetween(prevDayKey, todayKey);
  if (gap === 0) return prevStreak;
  if (gap === 1) return prevStreak + 1;
  return 1;
}

export function streakMilestoneBonus(streak: number): number {
  if (streak === 30) return XP_REWARDS.streakDay30;
  if (streak === 14) return XP_REWARDS.streakDay14;
  if (streak === 7)  return XP_REWARDS.streakDay7;
  if (streak === 3)  return XP_REWARDS.streakDay3;
  return 0;
}

// React hook
//
// Components read retention state through this hook; mutations stay in the
// store slice.

export function useRetention() {
  const xp = useAppStore(s => s.xp);
  const lastActiveDay = useAppStore(s => s.lastActiveDay);
  const streakDays = useAppStore(s => s.streakDays);
  const progress = progressInLevel(xp);
  return {
    xp,
    lastActiveDay,
    streakDays,
    ...progress,
    title: levelTitle(progress.level),
  };
}

/**
 * Award XP for a tracked action. Returns the XP delta so callers can show a
 * "+25 XP" floating chip if they want.
 */
export function awardXp(action: XpAction): number {
  const delta = XP_REWARDS[action];
  useAppStore.getState().addXp(delta);
  return delta;
}

/**
 * Call once per app foreground / day-start. Returns any milestone bonus
 * awarded so the UI can show a celebration (caller is responsible for the
 * visual).
 */
export function pingDailyActivity(): { newStreak: number; bonus: number } {
  const state = useAppStore.getState();
  const today = dayKey(new Date());
  if (state.lastActiveDay === today) {
    return { newStreak: state.streakDays, bonus: 0 };
  }
  const newStreak = nextStreak(state.lastActiveDay, state.streakDays);
  state.setLastActiveDay(today);
  state.setStreakDays(newStreak);
  const bonus = streakMilestoneBonus(newStreak) + XP_REWARDS.dailyActiveBonus;
  if (bonus > 0) state.addXp(bonus);
  return { newStreak, bonus };
}
