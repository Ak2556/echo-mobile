import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import {
  fetchRemoteNotifications,
  markRemoteNotificationRead,
  markAllRemoteNotificationsRead,
  dismissRemoteNotification,
  getSessionUserId,
} from '../../lib/supabaseEchoApi';
import { supabase } from '../../lib/supabase';
import { Notification } from '../../types';
import { NOTIFICATIONS_PAGE_SIZE, nextNotificationOffset } from '../../lib/notifications/paging';

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

  return useInfiniteQuery({
    queryKey: ['notifications'],
    enabled: remote,
    staleTime: 1000 * 30,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchRemoteNotifications({ offset: pageParam as number, limit: NOTIFICATIONS_PAGE_SIZE }),
    getNextPageParam: nextNotificationOffset,
  });
}

/**
 * Apply an edit to every page at once.
 *
 * The optimistic updates used to rewrite a flat Notification[]. Under
 * useInfiniteQuery the cache is { pages, pageParams }, and writing an array
 * over it does not merely fail to update — it destroys the page structure, so
 * the next fetch has no pageParams to continue from and the list silently stops
 * loading more.
 */
function mapCachedNotifications(
  data: InfiniteData<Notification[]> | undefined,
  fn: (n: Notification) => Notification,
): InfiniteData<Notification[]> | undefined {
  if (!data) return data;
  return { ...data, pages: data.pages.map(page => page.map(fn)) };
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markRemoteNotificationRead(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['notifications'] });
      const prev = qc.getQueryData<InfiniteData<Notification[]>>(['notifications']);
      qc.setQueryData<InfiniteData<Notification[]>>(['notifications'], old =>
        mapCachedNotifications(old, n => (n.id === id ? { ...n, isRead: true } : n)),
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
      const prev = qc.getQueryData<InfiniteData<Notification[]>>(['notifications']);
      qc.setQueryData<InfiniteData<Notification[]>>(['notifications'], old =>
        mapCachedNotifications(old, n => ({ ...n, isRead: true })),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['notifications'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

/**
 * Swipe a notification away.
 *
 * Optimistic because the row must leave under the finger; waiting for the
 * round trip makes a swipe feel like it failed. The rollback matters more than
 * usual here — a dismissal that silently did not persist would reappear on the
 * next refetch, which reads as the app undoing the user.
 */
export function useDismissNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dismissRemoteNotification(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['notifications'] });
      const prev = qc.getQueryData<InfiniteData<Notification[]>>(['notifications']);
      qc.setQueryData<InfiniteData<Notification[]>>(['notifications'], old =>
        old ? { ...old, pages: old.pages.map(page => page.filter(n => n.id !== id)) } : old,
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(['notifications'], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}
