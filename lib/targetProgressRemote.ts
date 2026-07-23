// Cross-app progress summary from the target_progress RPC (one round-trip over
// the structured tables, RLS-scoped to the signed-in user).

import { supabase } from './supabase';
import { isSupabaseRemote } from './remoteConfig';

export interface CrossAppProgress {
  habitBestStreak: number;
  habitActive: number;
  fitnessWorkoutsWeek: number;
  fitnessCaloriesToday: number;
  expenseNetMonth: number;
  expenseCurrency: string | null;
  tasksOpen: number;
  tasksDueToday: number;
}

export async function fetchCrossAppProgress(): Promise<CrossAppProgress | null> {
  try {
    if (!isSupabaseRemote()) return null;
    const { data, error } = await supabase.rpc('target_progress');
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) return null;
    return {
      habitBestStreak: Number(row.habit_best_streak) || 0,
      habitActive: Number(row.habit_active) || 0,
      fitnessWorkoutsWeek: Number(row.fitness_workouts_week) || 0,
      fitnessCaloriesToday: Number(row.fitness_calories_today) || 0,
      expenseNetMonth: Number(row.expense_net_month) || 0,
      expenseCurrency: (row.expense_currency as string) ?? null,
      tasksOpen: Number(row.tasks_open) || 0,
      tasksDueToday: Number(row.tasks_due_today) || 0,
    };
  } catch {
    return null;
  }
}
