import AsyncStorage from '@react-native-async-storage/async-storage';

export const HABITS_KEY = 'mini:habits';

export interface Habit {
  id: string;
  name: string;
  marker: string;
  color: string;
  completedDates: string[];
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
  try {
    const parsed = JSON.parse((await AsyncStorage.getItem(HABITS_KEY)) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map((habit): Habit => ({
      id: String(habit.id ?? Date.now()),
      name: String(habit.name ?? 'Habit'),
      marker: normalizeMarker(habit.marker),
      color: normalizeColor(habit.color),
      completedDates: Array.isArray(habit.completedDates) ? habit.completedDates : [],
      createdAt: String(habit.createdAt ?? new Date().toISOString()),
    }));
  } catch {
    return [];
  }
}

export async function saveHabits(habits: Habit[]): Promise<void> {
  await AsyncStorage.setItem(HABITS_KEY, JSON.stringify(habits));
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
  const updated = { ...habit, completedDates: [...dates].sort() };
  await saveHabits(habits.map(h => h.id === habit.id ? updated : h));
  return updated;
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
