// Client for the privacy-first social comparison (Phase 3). The leaderboard
// RPCs already gate on follow + opt-in server-side and return aggregates only;
// this just normalizes the two shapes and manages the caller's own opt-in row.

import { supabase } from './supabase';
import { isSupabaseRemote } from './remoteConfig';

export type SocialApp = 'habits' | 'fitness';

export interface LeaderRow {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatarColor: string;
  isSelf: boolean;
  value: number; // primary metric
  sub: number;   // secondary metric
}

export interface Leaderboard {
  rows: LeaderRow[];
  valueLabel: string;
  subLabel: string;
}

const CONFIG: Record<SocialApp, { rpc: string; value: string; sub: string; valueLabel: string; subLabel: string }> = {
  habits: { rpc: 'following_habit_leaderboard', value: 'best_streak', sub: 'entries_30d', valueLabel: 'day streak', subLabel: 'logs · 30d' },
  fitness: { rpc: 'following_fitness_leaderboard', value: 'workouts_week', sub: 'active_30d', valueLabel: 'workouts · wk', subLabel: 'active days' },
};

export async function fetchLeaderboard(app: SocialApp): Promise<Leaderboard | null> {
  try {
    if (!isSupabaseRemote()) return null;
    const c = CONFIG[app];
    const { data, error } = await supabase.rpc(c.rpc);
    if (error || !Array.isArray(data)) return null;
    const rows: LeaderRow[] = data.map((r: Record<string, unknown>) => ({
      userId: String(r.user_id),
      username: String(r.username ?? ''),
      displayName: String(r.display_name || r.username || ''),
      avatarUrl: (r.avatar_url as string) ?? null,
      avatarColor: (r.avatar_color as string) ?? '#3B82F6',
      isSelf: !!r.is_self,
      value: Number(r[c.value]) || 0,
      sub: Number(r[c.sub]) || 0,
    }));
    return { rows, valueLabel: c.valueLabel, subLabel: c.subLabel };
  } catch {
    return null;
  }
}

export interface SharePrefs {
  habits: boolean;
  fitness: boolean;
}

export async function getSharePrefs(): Promise<SharePrefs> {
  try {
    if (!isSupabaseRemote()) return { habits: false, fitness: false };
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid) return { habits: false, fitness: false };
    const { data } = await supabase
      .from('mini_app_share')
      .select('share_habits, share_fitness')
      .eq('user_id', uid)
      .maybeSingle();
    return { habits: !!data?.share_habits, fitness: !!data?.share_fitness };
  } catch {
    return { habits: false, fitness: false };
  }
}

export async function setSharePref(app: SocialApp, on: boolean): Promise<boolean> {
  try {
    if (!isSupabaseRemote()) return false;
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid) return false;
    const col = app === 'habits' ? 'share_habits' : 'share_fitness';
    const { error } = await supabase
      .from('mini_app_share')
      .upsert({ user_id: uid, [col]: on, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    return !error;
  } catch {
    return false;
  }
}
