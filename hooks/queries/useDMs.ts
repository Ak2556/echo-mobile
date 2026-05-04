import { useEffect } from 'react';
import { useQuery, useMutation, useInfiniteQuery, useQueryClient, InfiniteData } from '@tanstack/react-query';
import {
  fetchRemoteConversations,
  fetchRemoteMessages,
  sendRemoteDM,
  getSessionUserId,
  RemoteConversation,
  RemoteDirectMessage,
} from '../../lib/supabaseEchoApi';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { supabase } from '../../lib/supabase';

/** All conversations for the current user */
export function useRemoteConversations() {
  const remote = isSupabaseRemote();
  const qc = useQueryClient();

  // Real-time: invalidate on any INSERT to direct_messages (covers new convs too)
  useEffect(() => {
    if (!remote || !process.env.EXPO_PUBLIC_SUPABASE_URL) return;

    let mounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    getSessionUserId().then(uid => {
      if (!mounted || !uid) return;
      channel = supabase
        .channel(`dm_conversations:${uid}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, () => {
          qc.invalidateQueries({ queryKey: ['conversations'] });
        })
        .subscribe();
    });

    return () => {
      mounted = false;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [remote, qc]);

  return useQuery<RemoteConversation[]>({
    queryKey: ['conversations'],
    queryFn: fetchRemoteConversations,
    enabled: remote,
    staleTime: 1000 * 30,
  });
}

/** Messages in a conversation — infinite scroll loading older messages */
export function useRemoteMessages(conversationId: string | undefined) {
  const remote = isSupabaseRemote();
  const qc = useQueryClient();

  // Real-time: invalidate on INSERT to direct_messages in this conversation
  useEffect(() => {
    if (!remote || !conversationId || !process.env.EXPO_PUBLIC_SUPABASE_URL) return;

    const channel = supabase
      .channel(`direct_messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ['messages', conversationId] });
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [remote, conversationId, qc]);

  return useInfiniteQuery<RemoteDirectMessage[], Error, { pages: RemoteDirectMessage[][] }, unknown[], string | undefined>({
    queryKey: ['messages', conversationId],
    queryFn: async ({ pageParam }) =>
      conversationId ? fetchRemoteMessages(conversationId, 40, pageParam) : [],
    initialPageParam: undefined,
    getNextPageParam: (firstPage) =>
      firstPage.length === 40 ? firstPage[0].createdAt : undefined,
    enabled: remote && !!conversationId,
    staleTime: 1000 * 30,
  });
}

/** Send a DM mutation with optimistic update */
export function useSendRemoteDM(conversationId: string | undefined, recipientId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ content }: { content: string }) => {
      if (!recipientId) throw new Error('No recipient');
      return sendRemoteDM(recipientId, content);
    },
    onMutate: async ({ content }) => {
      await qc.cancelQueries({ queryKey: ['messages', conversationId] });
      const snapshot = qc.getQueryData(['messages', conversationId]);

      const uid = await getSessionUserId();
      const optimistic: RemoteDirectMessage = {
        id: `pending-${Date.now()}`,
        conversationId: conversationId ?? '',
        senderId: uid ?? 'me',
        content,
        kind: 'text',
        createdAt: new Date().toISOString(),
        readAt: null,
      };
      qc.setQueryData<InfiniteData<RemoteDirectMessage[]>>(
        ['messages', conversationId],
        old => old
          ? { ...old, pages: old.pages.map((p, i) => i === 0 ? [optimistic, ...p] : p) }
          : old,
      );
      return { snapshot };
    },
    onError: (_, __, ctx) => {
      if (ctx?.snapshot !== undefined) {
        qc.setQueryData(['messages', conversationId], ctx.snapshot);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
