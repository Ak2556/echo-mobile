import { useEffect } from 'react';
import { AppState } from 'react-native';
import { fetchPresence, pingPresence } from '../supabaseEchoApi';
import { useAppStore } from '../../store/useAppStore';
import {
  createHeartbeat, presenceIdKey, startPresencePolling, usePresenceStore, type PresenceRow,
} from './presenceCore';

// Presence over the database, not a Realtime channel. The old design put every signed-in client on one
// public channel that handed everyone the whole online list and was enforced only in this file.
// Now the server decides who may see whom (get_presence), and the client asks only about the people on
// screen. See docs/superpowers/specs/2026-10-16-presence-design.md.

/**
 * Mount once, in the root layout. Pings once a minute while the app is in the foreground, and clears the
 * store on sign-out. If the person shares nothing (both toggles off) it sends one last ping so the server
 * deletes whatever it stored, then stays quiet.
 */
export function usePresenceHeartbeat(userId: string | undefined) {
  const sharesAnything = useAppStore(s => s.onlineStatus || s.activityStatus);

  useEffect(() => () => usePresenceStore.getState().clear(), [userId]);

  useEffect(() => {
    if (!userId || !process.env.EXPO_PUBLIC_SUPABASE_URL) return;
    if (!sharesAnything) {
      void pingPresence().catch(() => {});
      return;
    }
    const heartbeat = createHeartbeat(pingPresence);
    if (AppState.currentState === 'active') heartbeat.start();
    const sub = AppState.addEventListener('change', state => (state === 'active' ? heartbeat.start() : heartbeat.stop()));
    return () => { sub.remove(); heartbeat.stop(); };
  }, [userId, sharesAnything]);
}

/**
 * Keeps presence fresh for the people on this screen: asks now and every 45 seconds while the app is in the
 * foreground. Read the answers with `usePresenceStore` or `isUserOnline(id)`. Safe to call from several
 * screens at once; each asks only about its own ids.
 */
export function usePresence(ids: (string | null | undefined)[]) {
  const me = useAppStore(s => s.userId);
  const key = presenceIdKey(ids, me);

  useEffect(() => {
    if (!me || !key || !process.env.EXPO_PUBLIC_SUPABASE_URL) return;
    const list = key.split(',');
    const apply = (rows: PresenceRow[]) => usePresenceStore.getState().apply(rows);
    let stop: (() => void) | null = null;
    const begin = () => { stop?.(); stop = startPresencePolling(list, fetchPresence, apply); };
    if (AppState.currentState === 'active') begin();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') begin();
      else { stop?.(); stop = null; }
    });
    return () => { sub.remove(); stop?.(); };
  }, [me, key]);
}
