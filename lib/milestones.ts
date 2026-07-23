// Milestone celebrations — a local notification the moment a habit crosses a
// streak milestone or Fitness hits its weekly workout goal. Fires only if
// notifications are already granted (never prompts mid-celebration) and each
// milestone fires once (a persisted "celebrated" set de-dupes).

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { STREAK_MILESTONES, getHabitStreak, type Habit } from './habits';
import type { FitnessDoc } from './fitness';

const CELEB_KEY = 'mini:milestonesCelebrated';

async function loadCelebrated(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(CELEB_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

async function saveCelebrated(set: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(CELEB_KEY, JSON.stringify([...set].slice(-500)));
  } catch {
    // ignore
  }
}

async function alreadyGranted(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

async function fire(title: string, body: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: true, data: { kind: 'milestone' } },
      trigger: null, // present immediately
    });
  } catch {
    // ignore
  }
}

/** Monday-based ISO-ish week key, e.g. 2026-W30. */
function weekKey(d = new Date()): string {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const jan1 = new Date(monday.getFullYear(), 0, 1);
  const week = Math.ceil(((monday.getTime() - jan1.getTime()) / 86_400_000 + jan1.getDay() + 1) / 7);
  return `${monday.getFullYear()}-W${week}`;
}

export function celebrateHabitMilestones(habits: Habit[]): void {
  void (async () => {
    try {
      if (!(await alreadyGranted())) return;
      const celebrated = await loadCelebrated();
      let changed = false;
      for (const h of habits) {
        if (h.archived) continue;
        const streak = getHabitStreak(h);
        const milestone = [...STREAK_MILESTONES].reverse().find(m => streak >= m);
        if (!milestone) continue;
        const key = `habit:${h.id}:${milestone}`;
        if (celebrated.has(key)) continue;
        // Mark this and every lower milestone for this habit as done.
        for (const m of STREAK_MILESTONES) if (m <= milestone) celebrated.add(`habit:${h.id}:${m}`);
        changed = true;
        await fire('🔥 Streak milestone!', `${milestone} days on ${h.name}. Keep it going.`);
      }
      if (changed) await saveCelebrated(celebrated);
    } catch {
      // ignore
    }
  })();
}

export function celebrateFitnessMilestones(doc: FitnessDoc): void {
  void (async () => {
    try {
      if (!(await alreadyGranted())) return;
      const goal = doc.goals.workoutsPerWeek;
      if (!goal || goal <= 0) return;
      const wk = weekKey();
      const start = (() => {
        const m = new Date();
        m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
        return m.toISOString().slice(0, 10);
      })();
      const count = doc.workouts.filter(w => (w.date || '').slice(0, 10) >= start).length;
      if (count < goal) return;
      const key = `fitness:weekgoal:${wk}`;
      const celebrated = await loadCelebrated();
      if (celebrated.has(key)) return;
      celebrated.add(key);
      await saveCelebrated(celebrated);
      await fire('💪 Weekly goal hit!', `${count}/${goal} workouts this week. Strong.`);
    } catch {
      // ignore
    }
  })();
}
