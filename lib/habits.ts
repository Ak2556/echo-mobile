import AsyncStorage from '@react-native-async-storage/async-storage';
import { pullMiniAppIfNewer, pushMiniApp } from './miniAppSync';
import { pushHabitsStructured } from './habitsRemote';

export const HABITS_KEY = 'mini:habits';

/** One completed day: when it was checked off, plus optional evidence. */
export interface HabitCheckIn {
  /** YYYY-MM-DD — matches an entry in completedDates */
  date: string;
  /** full ISO timestamp of the moment it was checked off */
  at: string;
  note?: string;
  /** local file URI — device-specific, other devices simply won't render it */
  photoUri?: string;
}

export interface Habit {
  id: string;
  name: string;
  marker: string;
  color: string;
  completedDates: string[];
  /** check-in details keyed by date; absent for pre-upgrade completions */
  log?: HabitCheckIn[];
  /** target completions per week, 1–7; absent = daily (7) */
  weeklyGoal?: number;
  /** daily reminder time; scheduled notification ids live per-device */
  reminder?: { hour: number; minute: number } | null;
  /** weekdays this habit applies to, 0–6 Sun–Sat; absent/empty = every day */
  scheduledDays?: number[];
  /** times per day (e.g. 8 glasses); absent or 1 = a simple check */
  dailyTarget?: number;
  /** per-date progress for quantity habits */
  dayCounts?: Record<string, number>;
  archived?: boolean;
  createdAt: string;
}

// Warm editorial palette (same family as lib/avatarPalette) — legacy stored
// colors are remapped on load, so old habits keep a stable hue.
export const HABIT_COLORS = ['#C65F3F', '#B08536', '#7A8B4E', '#4E8B7A', '#4E7A8B', '#8B5E7D', '#B35D6B', '#A04E4E'];
export const HABIT_MARKERS = ['HY', 'RN', 'RD', 'MD', 'ME', 'SL', 'RX', 'WR', 'GO', 'CL', 'GR', 'ST'];

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function getStreak(completedDates: string[]): number {
  if (completedDates.length === 0) return 0;
  const sorted = [...completedDates].sort().reverse();
  const today = todayStr();
  let streak = 0;
  let check = today;
  for (const d of sorted) {
    if (d === check) {
      streak++;
      const prev = new Date(check);
      prev.setDate(prev.getDate() - 1);
      check = prev.toISOString().slice(0, 10);
    } else if (d < check) break;
  }
  return streak;
}

/** Is the habit scheduled on this date? (unscheduled habits run every day) */
export function isScheduledOn(habit: Habit, dateStr: string): boolean {
  const days = habit.scheduledDays;
  if (!days || days.length === 0 || days.length === 7) return true;
  return days.includes(new Date(dateStr + 'T12:00:00').getDay());
}

export function dayCountFor(habit: Habit, dateStr: string): number {
  return habit.dayCounts?.[dateStr] ?? (habit.completedDates.includes(dateStr) ? (habit.dailyTarget ?? 1) : 0);
}

/**
 * Schedule-aware streak: consecutive scheduled days completed, walking back
 * from today. A still-pending today doesn't break the streak — it just
 * doesn't count yet.
 */
export function getHabitStreak(habit: Habit): number {
  const done = new Set(habit.completedDates);
  const today = todayStr();
  let streak = 0;
  const d = new Date(today + 'T12:00:00');
  for (let i = 0; i < 3660; i++) {
    const ds = d.toISOString().slice(0, 10);
    if (isScheduledOn(habit, ds)) {
      if (done.has(ds)) streak++;
      else if (ds !== today) break;
    }
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** Longest run of completed scheduled days in the habit's history. */
export function bestHabitStreak(habit: Habit): number {
  if (habit.completedDates.length === 0) return 0;
  const done = new Set(habit.completedDates);
  const first = [...habit.completedDates].sort()[0];
  const today = todayStr();
  let best = 0;
  let run = 0;
  const d = new Date(first + 'T12:00:00');
  const end = new Date(today + 'T12:00:00');
  while (d.getTime() <= end.getTime()) {
    const ds = d.toISOString().slice(0, 10);
    if (isScheduledOn(habit, ds)) {
      if (done.has(ds)) { run++; best = Math.max(best, run); }
      else if (ds !== today) run = 0;
    }
    d.setDate(d.getDate() + 1);
  }
  return best;
}

/** Completed share of scheduled days in the last `days` (excluding a pending today). */
export function completionRate(habit: Habit, days = 30): number {
  const done = new Set(habit.completedDates);
  const today = todayStr();
  let scheduled = 0;
  let completed = 0;
  const d = new Date(today + 'T12:00:00');
  for (let i = 0; i < days; i++) {
    const ds = d.toISOString().slice(0, 10);
    if (ds >= habit.createdAt.slice(0, 10) && isScheduledOn(habit, ds)) {
      if (done.has(ds)) { scheduled++; completed++; }
      else if (ds !== today) scheduled++;
    }
    d.setDate(d.getDate() - 1);
  }
  return scheduled === 0 ? 0 : Math.round((completed / scheduled) * 100);
}

/** Streak milestones worth celebrating. */
export const STREAK_MILESTONES = [7, 21, 50, 100, 365];

export async function loadHabits(): Promise<Habit[]> {
  const remote = await pullMiniAppIfNewer('habits');
  if (Array.isArray(remote)) await AsyncStorage.setItem(HABITS_KEY, JSON.stringify(remote));
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(HABITS_KEY)) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    const mapped = parsed.map((habit): Habit => ({
      id: String(habit.id ?? Date.now()),
      name: String(habit.name ?? 'Habit'),
      marker: normalizeMarker(habit.marker),
      color: normalizeColor(habit.color),
      completedDates: Array.isArray(habit.completedDates) ? habit.completedDates : [],
      log: Array.isArray(habit.log) ? habit.log : [],
      weeklyGoal: Number(habit.weeklyGoal) >= 1 && Number(habit.weeklyGoal) <= 7 ? Number(habit.weeklyGoal) : undefined,
      reminder: habit.reminder && Number.isFinite(habit.reminder.hour) ? { hour: Number(habit.reminder.hour), minute: Number(habit.reminder.minute) || 0 } : undefined,
      scheduledDays: Array.isArray(habit.scheduledDays) ? habit.scheduledDays.filter((n: unknown) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 6) : undefined,
      dailyTarget: Number(habit.dailyTarget) > 1 ? Math.min(99, Math.round(Number(habit.dailyTarget))) : undefined,
      dayCounts: habit.dayCounts && typeof habit.dayCounts === 'object' ? habit.dayCounts : undefined,
      archived: !!habit.archived,
      createdAt: String(habit.createdAt ?? new Date().toISOString()),
    }));
    // Backfill the structured tables for existing users (coalesced, best-effort)
    // so server stats/coaching are correct before their next save.
    if (mapped.length) pushHabitsStructured(mapped);
    return mapped;
  } catch {
    return [];
  }
}

export async function saveHabits(habits: Habit[]): Promise<void> {
  await AsyncStorage.setItem(HABITS_KEY, JSON.stringify(habits));
  pushMiniApp('habits', habits);
  pushHabitsStructured(habits);
}

export async function createHabit(input: {
  name?: string;
  marker?: string;
  color?: string;
}): Promise<Habit> {
  const name = input.name?.trim();
  if (!name) throw new Error('Habit name is required');
  const habit: Habit = {
    id: `${Date.now()}`,
    name,
    marker: normalizeMarker(input.marker),
    color: normalizeColor(input.color),
    completedDates: [],
    createdAt: new Date().toISOString(),
  };
  const habits = await loadHabits();
  await saveHabits([habit, ...habits]);
  return habit;
}

export async function setHabitCompletion(input: {
  id?: string;
  name?: string;
  date?: string;
  completed: boolean;
}): Promise<Habit> {
  const habits = await loadHabits();
  const habit = findHabit(habits, input);
  if (!habit) throw new Error('No matching habit found');
  const date = normalizeDate(input.date);
  const dates = new Set(habit.completedDates);
  if (input.completed) dates.add(date);
  else dates.delete(date);
  const log = (habit.log ?? []).filter(entry => entry.date !== date);
  if (input.completed) log.push({ date, at: new Date().toISOString() });
  const updated = { ...habit, completedDates: [...dates].sort(), log };
  await saveHabits(habits.map(h => h.id === habit.id ? updated : h));
  return updated;
}

export function checkInFor(habit: Habit, date: string): HabitCheckIn | undefined {
  return habit.log?.find(entry => entry.date === date);
}

/** Attach or update the note / photo proof on an existing check-in. */
export async function setCheckInDetails(
  habitId: string,
  date: string,
  details: { note?: string; photoUri?: string },
): Promise<Habit> {
  const habits = await loadHabits();
  const habit = habits.find(h => h.id === habitId);
  if (!habit) throw new Error('No matching habit found');
  const log = [...(habit.log ?? [])];
  const idx = log.findIndex(entry => entry.date === date);
  if (idx >= 0) log[idx] = { ...log[idx], ...details };
  else log.push({ date, at: new Date().toISOString(), ...details });
  const updated = { ...habit, log };
  await saveHabits(habits.map(h => h.id === habitId ? updated : h));
  return updated;
}

export function formatCheckInTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Completions in the current Monday-based week. */
export function thisWeekCount(completedDates: string[]): number {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const start = monday.toISOString().slice(0, 10);
  return completedDates.filter(d => d >= start).length;
}

export function findHabit(habits: Habit[], input: { id?: string; name?: string }): Habit | undefined {
  if (input.id) return habits.find(habit => habit.id === input.id);
  const query = input.name?.trim().toLowerCase();
  if (!query) return undefined;
  return habits.find(habit => habit.name.toLowerCase() === query)
    ?? habits.find(habit => habit.name.toLowerCase().includes(query));
}

function normalizeMarker(marker?: string): string {
  const normalized = marker?.trim().toUpperCase();
  return normalized && HABIT_MARKERS.includes(normalized) ? normalized : HABIT_MARKERS[0];
}

function normalizeColor(color?: string): string {
  const normalized = color?.trim();
  if (!normalized || !/^#[0-9a-fA-F]{6}$/.test(normalized)) return HABIT_COLORS[0];
  if (HABIT_COLORS.includes(normalized)) return normalized;
  // Legacy saturated palette → warm equivalent (same hue-family mapping as
  // lib/avatarPalette so existing habits keep a stable identity).
  const legacy: Record<string, string> = {
    '#6366f1': '#4E7A8B', '#10b981': '#4E8B7A', '#f59e0b': '#B08536',
    '#ef4444': '#A04E4E', '#8b5cf6': '#8B5E7D', '#06b6d4': '#4E7A8B',
    '#ec4899': '#B35D6B', '#f97316': '#C65F3F',
  };
  return legacy[normalized.toLowerCase()] ?? normalized;
}

function normalizeDate(date?: string): string {
  const trimmed = date?.trim();
  if (!trimmed) return todayStr();
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return todayStr();
  return parsed.toISOString().slice(0, 10);
}
