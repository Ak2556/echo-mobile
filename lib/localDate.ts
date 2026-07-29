/**
 * Local calendar-day helpers.
 *
 * Activity that belongs to the *user's* day — habit/pomodoro/fitness streaks,
 * "today" totals, task due dates — must key off the user's LOCAL midnight, not
 * UTC. Using `new Date().toISOString().slice(0,10)` (UTC) rolls the day over at
 * the wrong moment and silently breaks streaks for anyone far from UTC.
 *
 * NOTE: the daily-question domain (lib/dailyStreak.ts, fetchTodaysDailyQuestion)
 * deliberately stays on UTC to match how questions are keyed by `active_date` —
 * do NOT swap those to local.
 */

/** YYYY-MM-DD for a Date in the device's local timezone. */
export function localDayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The local day `n` days from `key` (YYYY-MM-DD). Anchored at local noon so
 *  DST transitions can't nudge it across a boundary. */
export function shiftDayKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDayKey(d);
}
