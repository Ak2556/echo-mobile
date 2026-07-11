import AsyncStorage from '@react-native-async-storage/async-storage';
import { pullMiniAppIfNewer, pushMiniApp } from './miniAppSync';

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
  createdAt: string;
}

export const HABIT_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#F97316'];
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

export async function loadHabits(): Promise<Habit[]> {
  const remote = await pullMiniAppIfNewer('habits');
  if (Array.isArray(remote)) await AsyncStorage.setItem(HABITS_KEY, JSON.stringify(remote));
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(HABITS_KEY)) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map((habit): Habit => ({
      id: String(habit.id ?? Date.now()),
      name: String(habit.name ?? 'Habit'),
      marker: normalizeMarker(habit.marker),
      color: normalizeColor(habit.color),
      completedDates: Array.isArray(habit.completedDates) ? habit.completedDates : [],
      log: Array.isArray(habit.log) ? habit.log : [],
      weeklyGoal: Number(habit.weeklyGoal) >= 1 && Number(habit.weeklyGoal) <= 7 ? Number(habit.weeklyGoal) : undefined,
      reminder: habit.reminder && Number.isFinite(habit.reminder.hour) ? { hour: Number(habit.reminder.hour), minute: Number(habit.reminder.minute) || 0 } : undefined,
      createdAt: String(habit.createdAt ?? new Date().toISOString()),
    }));
  } catch {
    return [];
  }
}

export async function saveHabits(habits: Habit[]): Promise<void> {
  await AsyncStorage.setItem(HABITS_KEY, JSON.stringify(habits));
  pushMiniApp('habits', habits);
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
  return normalized && HABIT_COLORS.includes(normalized) ? normalized : HABIT_COLORS[0];
}

function normalizeDate(date?: string): string {
  const trimmed = date?.trim();
  if (!trimmed) return todayStr();
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return todayStr();
  return parsed.toISOString().slice(0, 10);
}
