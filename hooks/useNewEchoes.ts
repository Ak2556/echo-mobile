import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { fetchNewEchoCount } from '../lib/supabaseEchoApi';
import { createNewEchoesPoller, type NewEchoesPoller } from '../lib/core/newEchoesPoller';
import { useAppStore } from '../store/useAppStore';

/**
 * The "N new echoes" pill on Home.
 *
 * Polls a cheap count while Home is focused and the app is in the foreground, checks straight away on
 * returning to either, and stops otherwise, so a backgrounded or hidden tab costs nothing. See
 * lib/core/newEchoesPoller.ts for why this is a poll and not a Realtime subscription.
 */
export function useNewEchoes(): { count: number; reset: () => void } {
  const [count, setCount] = useState(0);
  const userId = useAppStore((s) => s.userId);
  const selfRef = useRef<string | undefined>(undefined);
  selfRef.current = userId && userId !== 'me' ? userId : undefined;

  const pollerRef = useRef<NewEchoesPoller | null>(null);
  const focusedRef = useRef(false);
  const startedOnce = useRef(false);

  useEffect(() => {
    if (!process.env.EXPO_PUBLIC_SUPABASE_URL) return;
    const poller = createNewEchoesPoller({
      fetchCount: (since) => fetchNewEchoCount(since, selfRef.current),
      onCount: setCount,
    });
    pollerRef.current = poller;

    const sync = () => {
      const active = focusedRef.current && AppState.currentState === 'active';
      if (active) {
        // The first start has nothing to catch up on; every later one does.
        poller.start({ immediate: startedOnce.current });
        startedOnce.current = true;
      } else {
        poller.stop();
      }
    };
    const sub = AppState.addEventListener('change', sync);
    sync();
    return () => { sub.remove(); poller.stop(); pollerRef.current = null; };
  }, []);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      const p = pollerRef.current;
      if (p && AppState.currentState === 'active') { p.start({ immediate: startedOnce.current }); startedOnce.current = true; }
      return () => { focusedRef.current = false; pollerRef.current?.stop(); };
    }, []),
  );

  const reset = useCallback(() => { pollerRef.current?.reset(); setCount(0); }, []);
  return { count, reset };
}
