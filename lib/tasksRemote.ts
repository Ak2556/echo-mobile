// Best-effort structured mirror of the local task list into task_item. Local
// blob stays authoritative for the offline UI; this keeps the server's queryable
// copy in sync for insights, AI, and reminders. Never throws.

import { supabase } from './supabase';
import { isSupabaseRemote } from './remoteConfig';
import type { TaskItem } from './tasks';

const csv = (v: string) => `"${v.replace(/"/g, '""')}"`;

export function pushTasksStructured(tasks: TaskItem[]): void {
  void (async () => {
    try {
      if (!isSupabaseRemote()) return;
      const { data: session } = await supabase.auth.getSession();
      const uid = session?.session?.user?.id;
      if (!uid) return;

      const rows = tasks
        .filter(t => t.title.trim())
        .map(t => ({
          user_id: uid,
          client_id: t.id,
          title: t.title,
          notes: t.notes ?? null,
          due: t.due ? t.due.slice(0, 10) : null,
          done: !!t.done,
          priority: t.priority,
          created_at: t.createdAt ?? null,
          updated_at: t.updatedAt ?? null,
        }));
      if (rows.length) {
        await supabase.from('task_item').upsert(rows, { onConflict: 'user_id,client_id' });
        const ids = rows.map(r => csv(r.client_id)).join(',');
        await supabase.from('task_item').delete().eq('user_id', uid).not('client_id', 'in', `(${ids})`);
      } else {
        await supabase.from('task_item').delete().eq('user_id', uid);
      }
    } catch {
      // best-effort; local + blob sync remain authoritative
    }
  })();
}

export interface TaskStat {
  openCount: number;
  doneCount: number;
  dueToday: number;
  overdue: number;
  highOpen: number;
}

export async function fetchTaskStats(): Promise<TaskStat | null> {
  try {
    if (!isSupabaseRemote()) return null;
    const { data, error } = await supabase.rpc('task_stats');
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) return null;
    return {
      openCount: Number(row.open_count) || 0,
      doneCount: Number(row.done_count) || 0,
      dueToday: Number(row.due_today) || 0,
      overdue: Number(row.overdue) || 0,
      highOpen: Number(row.high_open) || 0,
    };
  } catch {
    return null;
  }
}
