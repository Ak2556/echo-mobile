/**
 * Daily-question streak math.
 *
 * Daily questions are keyed by `active_date` (a UTC YYYY-MM-DD day key — the
 * same basis `fetchTodaysDailyQuestion` uses to pick "today"), so the streak
 * is computed in the same UTC day space to stay consistent with which question
 * a user is shown.
 *
 * The "don't break the chain" mechanic: a streak is *alive* only if the most
 * recent answered day is today or yesterday. Today may be unanswered without
 * killing the streak (you still have until end of day) — but once yesterday
 * passes unanswered, the chain is broken and the count resets to 0.
 */

/** UTC day key (YYYY-MM-DD) for a Date. */
export function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

/**
 * Consecutive-day streak from a set of UTC day keys, anchored at `todayKey`.
 * Returns 0 when the newest answered day is older than yesterday (chain broken)
 * or when there are no answers.
 */
export function computeDayStreak(
  dayKeys: Iterable<string>,
  todayKey: string = utcDayKey(new Date()),
): number {
  const set = new Set(dayKeys);
  if (set.size === 0) return 0;

  const todayMs = Date.parse(`${todayKey}T00:00:00.000Z`);
  if (Number.isNaN(todayMs)) return 0;
  const yesterdayKey = utcDayKey(new Date(todayMs - DAY_MS));

  // The chain must reach today or yesterday to still be alive.
  let cursorMs: number;
  if (set.has(todayKey)) cursorMs = todayMs;
  else if (set.has(yesterdayKey)) cursorMs = todayMs - DAY_MS;
  else return 0;

  let streak = 0;
  while (set.has(utcDayKey(new Date(cursorMs)))) {
    streak += 1;
    cursorMs -= DAY_MS;
  }
  return streak;
}
