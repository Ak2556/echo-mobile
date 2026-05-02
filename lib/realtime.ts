// Thin wrapper around Supabase Realtime. Each call returns an unsubscribe
// function. No-ops gracefully if SUPABASE_URL isn't configured.

import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

export function useRealtimeNewEchoes(): { count: number; reset: () => void } {
  const [count, setCount] = useState(0);
  const ref = useRef(0);

  useEffect(() => {
    if (!process.env.EXPO_PUBLIC_SUPABASE_URL) return;
    const ch = supabase
      .channel('public_echoes_inserts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'public_echoes' }, () => {
        ref.current += 1;
        setCount(ref.current);
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
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
      .channel(`echo_comments:${echoId}`)
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

// DM presence channel: broadcasts typing + read receipts via presence track.
export function useDMPresence(conversationId: string | undefined, currentUserId: string | undefined) {
  const [typingByUser, setTypingByUser] = useState<Record<string, number>>({});
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!conversationId || !currentUserId || !process.env.EXPO_PUBLIC_SUPABASE_URL) return;
    const ch = supabase.channel(`dm:${conversationId}`, {
      config: { presence: { key: currentUserId } },
    });
    ch
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState() as Record<string, { typing?: number }[]>;
        const next: Record<string, number> = {};
        for (const [uid, metas] of Object.entries(state)) {
          const t = metas?.[0]?.typing ?? 0;
          if (t && Date.now() - t < 4000) next[uid] = t;
        }
        setTypingByUser(next);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ online_at: Date.now() });
        }
      });
    channelRef.current = ch;
    return () => { void supabase.removeChannel(ch); };
  }, [conversationId, currentUserId]);

  const setTyping = (typing: boolean) => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.track({ online_at: Date.now(), typing: typing ? Date.now() : 0 }).catch(() => {});
  };

  return { typingByUser, setTyping };
}
