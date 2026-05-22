import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import {
  fetchRemoteNotifications,
  markRemoteNotificationRead,
  markAllRemoteNotificationsRead,
  getSessionUserId,
} from '../../lib/supabaseEchoApi';
import { supabase } from '../../lib/supabase';
import { Notification } from '../../types';

export function useRemoteNotifications() {
  const qc = useQueryClient();
  const remote = isSupabaseRemote();

  // Real-time subscription: invalidate on INSERT to notifications
  useEffect(() => {
    if (!remote || !process.env.EXPO_PUBLIC_SUPABASE_URL) return;

    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    getSessionUserId().then(uid => {
      if (!mounted || !uid) return;
      channel = supabase
        .channel(`notifications:${uid}:${Math.random().toString(36).slice(2, 10)}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${uid}`,
          },
          () => {
            qc.invalidateQueries({ queryKey: ['notifications'] });
          },
        )
        .subscribe();
    });

    return () => {
      mounted = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [remote, qc]);

  return useQuery<Notification[]>({
    queryKey: ['notifications'],
    enabled: remote,
    staleTime: 1000 * 30,
    queryFn: fetchRemoteNotifications,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markRemoteNotificationRead(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['notifications'] });
      const prev = qc.getQueryData<Notification[]>(['notifications']);
      qc.setQueryData<Notification[]>(['notifications'], old =>
        (old ?? []).map(n => n.id === id ? { ...n, isRead: true } : n),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['notifications'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markAllRemoteNotificationsRead,
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['notifications'] });
      const prev = qc.getQueryData<Notification[]>(['notifications']);
      qc.setQueryData<Notification[]>(['notifications'], old =>
        (old ?? []).map(n => ({ ...n, isRead: true })),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['notifications'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
