// Thin wrapper around Supabase Realtime. Each call returns an unsubscribe
// function. No-ops gracefully if SUPABASE_URL isn't configured.

import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../supabase';

/** Generate a unique-per-mount channel suffix. supabase-realtime keeps a
 *  channel registry keyed by topic name — re-using a name across Fast Refresh
 *  or multiple component mounts returns the already-subscribed channel and
 *  makes `.on()` throw "cannot add postgres_changes callbacks ... after
 *  subscribe()". Append a random id so every hook instance gets a fresh
 *  channel. */
function uniqueChannelName(base: string): string {
  return `${base}:${Math.random().toString(36).slice(2, 10)}`;
}

export function useRealtimeNewEchoes(): { count: number; reset: () => void } {
  const [count, setCount] = useState(0);
  const ref = useRef(0);

  useEffect(() => {
    if (!process.env.EXPO_PUBLIC_SUPABASE_URL) return;
    // Scale P0 (realtime fan-out): this is a global, unfiltered subscription, so
    // every online client would otherwise receive every new-echo INSERT. Two
    // bounded mitigations that cost nothing in UX:
    //  1) Only hold the live subscription while the app is FOREGROUND — a
    //     backgrounded client can't see the "new echoes" pill, so dropping it
    //     cuts fan-out to actively-watching users.
    //  2) BATCH bursts of inserts into one count update (fewer re-renders).
    // (The deeper batch/poll rework is deliberately deferred to after the cloud
    //  load test quantifies the real ceiling — see docs/scale-readiness-backlog.)
    let ch: ReturnType<typeof supabase.channel> | null = null;
    let pending = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      if (pending > 0) { ref.current += pending; pending = 0; setCount(ref.current); }
    };
    const subscribe = () => {
      if (ch) return;
      ch = supabase
        .channel(uniqueChannelName('public_echoes_inserts'))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'public_echoes' }, () => {
          pending += 1;
          if (!timer) timer = setTimeout(flush, 800);
        })
        .subscribe();
    };
    const unsubscribe = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (ch) { void supabase.removeChannel(ch); ch = null; }
    };

    if (AppState.currentState === 'active') subscribe();
    const appSub = AppState.addEventListener('change', (s) => {
      if (s === 'active') subscribe(); else unsubscribe();
    });
    return () => { appSub.remove(); unsubscribe(); };
  }, []);

  const reset = () => { ref.current = 0; setCount(0); };
  return { count, reset };
}

export function useRealtimeNewComments(echoId: string | undefined): { count: number; reset: () => void } {
  const [count, setCount] = useState(0);
  const ref = useRef(0);

  useEffect(() => {
    if (!echoId || !process.env.EXPO_PUBLIC_SUPABASE_URL) return;
    const ch = supabase
      .channel(uniqueChannelName(`echo_comments:${echoId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'echo_comments', filter: `echo_id=eq.${echoId}` }, () => {
        ref.current += 1;
        setCount(ref.current);
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [echoId]);

  const reset = () => { ref.current = 0; setCount(0); };
  return { count, reset };
}

