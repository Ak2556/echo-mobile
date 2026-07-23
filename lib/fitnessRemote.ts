// Best-effort structured mirror of the local FitnessDoc into the relational
// fitness_* tables. Local blob (lib/fitness.ts) stays authoritative for the
// offline UI; this keeps the server's queryable copy in sync for insights, AI
// coaching, comparison, and notifications. Never throws.

import { supabase } from './supabase';
import { isSupabaseRemote } from './remoteConfig';
import type { FitnessDoc } from './fitness';

const day = (s: string) => (s || '').slice(0, 10); // normalize to YYYY-MM-DD
const csv = (v: string) => `"${v.replace(/"/g, '""')}"`;

export function pushFitnessStructured(doc: FitnessDoc): void {
  void (async () => {
    try {
      if (!isSupabaseRemote()) return;
      const { data: session } = await supabase.auth.getSession();
      const uid = session?.session?.user?.id;
      if (!uid) return;

      await reconcile('fitness_meal', uid, doc.meals.map(m => ({
        user_id: uid, client_id: m.id, name: m.name, kind: m.kind,
        calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, date: day(m.date),
      })));
      await reconcile('fitness_workout', uid, doc.workouts.map(w => ({
        user_id: uid, client_id: w.id, title: w.title, exercises: w.exercises ?? [], date: day(w.date),
      })));
      await reconcile('fitness_water', uid, doc.water.map(w => ({
        user_id: uid, client_id: w.id, ml: w.ml, date: day(w.date),
      })));
      await reconcile('fitness_weight', uid, doc.weights.map(w => ({
        user_id: uid, client_id: w.id, kg: w.kg, date: day(w.date),
      })));
      await reconcile('fitness_measurement', uid, doc.measurements.map(m => ({
        user_id: uid, client_id: m.id, date: day(m.date),
        fields: { chest: m.chest, waist: m.waist, hips: m.hips, arm: m.arm, thigh: m.thigh },
      })));

      const g = doc.goals;
      await supabase.from('fitness_goals').upsert({
        user_id: uid, calories: g.calories, protein: g.protein, carbs: g.carbs,
        fat: g.fat, water_ml: g.waterMl, workouts_per_week: g.workoutsPerWeek,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
    } catch {
      // best-effort; local + blob sync remain authoritative
    }
  })();
}

async function reconcile(
  table: string,
  uid: string,
  rows: Array<{ client_id: string; [k: string]: unknown }>,
): Promise<void> {
  if (rows.length) {
    await supabase.from(table).upsert(rows, { onConflict: 'user_id,client_id' });
    const ids = rows.map(r => csv(String(r.client_id))).join(',');
    await supabase.from(table).delete().eq('user_id', uid).not('client_id', 'in', `(${ids})`);
  } else {
    await supabase.from(table).delete().eq('user_id', uid);
  }
}

export interface FitnessStat {
  caloriesToday: number;
  proteinToday: number;
  waterTodayMl: number;
  workoutsWeek: number;
  latestWeightKg: number | null;
  logStreak: number;
}

export async function fetchFitnessStats(): Promise<FitnessStat | null> {
  try {
    if (!isSupabaseRemote()) return null;
    const { data, error } = await supabase.rpc('fitness_stats');
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) return null;
    return {
      caloriesToday: Number(row.calories_today) || 0,
      proteinToday: Number(row.protein_today) || 0,
      waterTodayMl: Number(row.water_today_ml) || 0,
      workoutsWeek: Number(row.workouts_week) || 0,
      latestWeightKg: row.latest_weight_kg != null ? Number(row.latest_weight_kg) : null,
      logStreak: Number(row.log_streak) || 0,
    };
  } catch {
    return null;
  }
}
