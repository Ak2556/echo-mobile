// Best-effort structured mirror of the local Habits collection into the
// relational `habit` / `habit_entry` tables. The offline UI keeps reading the
// local-first blob (lib/habits.ts); this just keeps the server's queryable copy
// in sync so streaks, comparison, AI coaching, and milestone notifications have
// real rows to work with. Never throws — signed-out / offline just no-ops.

import { supabase } from './supabase';
import { isSupabaseRemote } from './remoteConfig';
import { coalesce } from './coalesce';
import type { Habit } from './habits';

export interface HabitStat {
  habitClientId: string;
  entries: number;
  lastDate: string | null;
  currentStreak: number;
  completion30d: number;
}

/** Push the full habits set to the structured tables and reconcile deletions. */
export function pushHabitsStructured(habits: Habit[]): void {
  coalesce('habits', habits, flushHabits);
}

function flushHabits(habits: Habit[]): void {
  void (async () => {
    try {
      if (!isSupabaseRemote()) return;
      const { data: session } = await supabase.auth.getSession();
      const uid = session?.session?.user?.id;
      if (!uid) return;

      const habitRows = habits.map(h => ({
        user_id: uid,
        client_id: h.id,
        name: h.name,
        marker: h.marker,
        color: h.color,
        weekly_goal: h.weeklyGoal ?? null,
        scheduled_days: h.scheduledDays ?? null,
        daily_target: h.dailyTarget ?? null,
        reminder: h.reminder ?? null,
        archived: !!h.archived,
        created_at: h.createdAt,
      }));
      if (habitRows.length) {
        await supabase.from('habit').upsert(habitRows, { onConflict: 'user_id,client_id' });
      }

      // Drop habits deleted locally (cascade removes their entries).
      const keepIds = habits.map(h => h.id);
      if (keepIds.length) {
        await supabase.from('habit').delete().eq('user_id', uid).not('client_id', 'in', `(${keepIds.map(csv).join(',')})`);
      } else {
        await supabase.from('habit').delete().eq('user_id', uid);
      }

      // Upsert current completions.
      const entryRows = habits.flatMap(h => {
        const logByDate = new Map((h.log ?? []).map(l => [l.date, l]));
        return h.completedDates.map(date => {
          const l = logByDate.get(date);
          return {
            user_id: uid,
            habit_client_id: h.id,
            date,
            count: h.dayCounts?.[date] ?? h.dailyTarget ?? 1,
            note: l?.note ?? null,
            checked_at: l?.at ?? null,
          };
        });
      });
      if (entryRows.length) {
        await supabase.from('habit_entry').upsert(entryRows, { onConflict: 'user_id,habit_client_id,date' });
      }

      // Reconcile un-checked days per habit (dates removed locally).
      for (const h of habits) {
        const dates = h.completedDates;
        if (dates.length) {
          await supabase.from('habit_entry').delete()
            .eq('user_id', uid).eq('habit_client_id', h.id)
            .not('date', 'in', `(${dates.map(csv).join(',')})`);
        } else {
          await supabase.from('habit_entry').delete()
            .eq('user_id', uid).eq('habit_client_id', h.id);
        }
      }
    } catch {
      // best-effort; local + blob sync remain authoritative
    }
  })();
}

/** Server-computed stats (streaks / completion) for the signed-in user's habits. */
export async function fetchHabitStats(): Promise<Record<string, HabitStat>> {
  try {
    if (!isSupabaseRemote()) return {};
    const { data, error } = await supabase.rpc('habit_stats');
    if (error || !Array.isArray(data)) return {};
    const out: Record<string, HabitStat> = {};
    for (const row of data as Array<Record<string, unknown>>) {
      const id = String(row.habit_client_id);
      out[id] = {
        habitClientId: id,
        entries: Number(row.entries) || 0,
        lastDate: (row.last_date as string) ?? null,
        currentStreak: Number(row.current_streak) || 0,
        completion30d: Number(row.completion_30d) || 0,
      };
    }
    return out;
  } catch {
    return {};
  }
}

// PostgREST in-list values are comma-joined inside parens; quote to be safe
// against commas/spaces in ids (habit client ids are timestamps, but dates are
// plain — quoting is harmless and correct for both).
function csv(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}
