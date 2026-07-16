import AsyncStorage from '@react-native-async-storage/async-storage';
import { pullMiniAppIfNewer, pushMiniApp } from './miniAppSync';

export const PLANNER_KEY = 'mini:planner';

export type PlannerSlot = 'morning' | 'afternoon' | 'evening';

export interface PlannerItem {
  id: string;
  title: string;
  date: string;
  slot: PlannerSlot;
  done: boolean;
  createdAt: string;
}

export const PLANNER_SLOTS: { id: PlannerSlot; label: string }[] = [
  { id: 'morning', label: 'Morning' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
];

export function plannerToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function shiftPlannerDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function normalize(raw: unknown): PlannerItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Partial<PlannerItem> => !!item && typeof item === 'object')
    .map(item => {
      const slot: PlannerSlot = item.slot === 'afternoon' || item.slot === 'evening' ? item.slot : 'morning';
      return {
        id: typeof item.id === 'string' ? item.id : `${Date.now()}`,
        title: typeof item.title === 'string' ? item.title : '',
        date: typeof item.date === 'string' ? item.date : plannerToday(),
        slot,
        done: item.done === true,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
      };
    })
    .filter(item => item.title.trim());
}

export async function loadPlanner(): Promise<PlannerItem[]> {
  const remote = await pullMiniAppIfNewer('planner');
  if (Array.isArray(remote)) {
    const next = normalize(remote);
    await AsyncStorage.setItem(PLANNER_KEY, JSON.stringify(next));
    return next;
  }
  try {
    return normalize(JSON.parse((await AsyncStorage.getItem(PLANNER_KEY)) ?? '[]'));
  } catch {
    return [];
  }
}

export async function savePlanner(items: PlannerItem[]): Promise<void> {
  const sorted = items.slice().sort((a, b) =>
    b.date.localeCompare(a.date) ||
    slotIndex(a.slot) - slotIndex(b.slot) ||
    Number(a.done) - Number(b.done));
  await AsyncStorage.setItem(PLANNER_KEY, JSON.stringify(sorted));
  pushMiniApp('planner', sorted);
}

export function slotIndex(slot: PlannerSlot): number {
  return slot === 'morning' ? 0 : slot === 'afternoon' ? 1 : 2;
}

export function plannerStats(items: PlannerItem[], date = plannerToday()) {
  const day = items.filter(item => item.date === date);
  return {
    total: day.length,
    done: day.filter(item => item.done).length,
    open: day.filter(item => !item.done).length,
  };
}
