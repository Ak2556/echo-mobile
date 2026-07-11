// Cross-device sync for the mini-app tools.
//
// Model: one JSONB document per (user, app) in mini_app_data, compared by
// updated_at — whole-document last-write-wins. Local AsyncStorage stays the
// source the UI reads synchronously; the cloud row is reconciled inside each
// tool's load/save (see lib/notes.ts etc.), so screens and the AI tools need
// no changes and everything degrades to local-only when signed out/offline.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { isSupabaseRemote } from './remoteConfig';

export type MiniApp = 'notes' | 'habits' | 'expenses' | 'fitness';

const stampKey = (app: MiniApp) => `mini:${app}:updatedAt`;

export async function localStamp(app: MiniApp): Promise<string | null> {
  try { return await AsyncStorage.getItem(stampKey(app)); } catch { return null; }
}

export async function setLocalStamp(app: MiniApp, iso: string): Promise<void> {
  try { await AsyncStorage.setItem(stampKey(app), iso); } catch {}
}

/** Fire-and-forget push of the full document (array or object). Never throws. */
export function pushMiniApp(app: MiniApp, data: unknown): void {
  void (async () => {
    try {
      if (!isSupabaseRemote()) return;
      const { data: session } = await supabase.auth.getSession();
      const uid = session?.session?.user?.id;
      if (!uid) return;
      const now = new Date().toISOString();
      await setLocalStamp(app, now);
      await supabase
        .from('mini_app_data')
        .upsert({ user_id: uid, app, data, updated_at: now }, { onConflict: 'user_id,app' });
    } catch {
      // Offline or transient — local copy is authoritative until next save.
    }
  })();
}

/**
 * Reconcile on load: if the cloud copy is newer than anything this device has
 * written, adopt it (and persist locally via the caller). Returns the winning
 * remote document, or null when local wins / offline / signed out.
 * Callers validate the shape (array vs object) themselves.
 */
export async function pullMiniAppIfNewer(app: MiniApp): Promise<unknown | null> {
  try {
    if (!isSupabaseRemote()) return null;
    const { data: session } = await supabase.auth.getSession();
    const uid = session?.session?.user?.id;
    if (!uid) return null;
    const { data: row, error } = await supabase
      .from('mini_app_data')
      .select('data, updated_at')
      .eq('user_id', uid)
      .eq('app', app)
      .maybeSingle();
    if (error || !row) return null;
    const local = await localStamp(app);
    if (local && local >= (row.updated_at as string)) return null;
    await setLocalStamp(app, row.updated_at as string);
    return row.data ?? null;
  } catch {
    return null;
  }
}
