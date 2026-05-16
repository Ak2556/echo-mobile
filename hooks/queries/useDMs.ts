import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useQuery, useMutation, useInfiniteQuery,
  useQueryClient, InfiniteData,
} from '@tanstack/react-query';
import {
  fetchRemoteConversations,
  fetchRemoteMessages,
  fetchConversationById,
  sendRemoteDM,
  markMessagesRead,
  deleteRemoteMessage,
  addMessageReaction,
  removeMessageReaction,
  getSessionUserId,
  RemoteConversation,
  RemoteDirectMessage,
} from '../../lib/supabaseEchoApi';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { supabase } from '../../lib/supabase';

// ── Conversations list ────────────────────────────────────────────────────────

/** All conversations for the current user, with real unread counts. */
export function useRemoteConversations() {
  const remote = isSupabaseRemote();
  const qc = useQueryClient();

  // Real-time: invalidate on any DM INSERT (covers new conversations too)
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
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages' }, () => {
          // Covers read_at updates → re-compute unread counts
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
    staleTime: 30_000,
  });
}

// ── Single conversation ───────────────────────────────────────────────────────

/** Fetch a conversation header by UUID (used when local store doesn't have it). */
export function useRemoteConversation(conversationId: string | undefined) {
  return useQuery<RemoteConversation | null>({
    queryKey: ['conversation', conversationId],
    queryFn: () => fetchConversationById(conversationId!),
    enabled: !!conversationId,
    staleTime: 5 * 60_000,
  });
}

// ── Messages ──────────────────────────────────────────────────────────────────

/** Messages in a conversation — infinite scroll (load older on demand). */
export function useRemoteMessages(conversationId: string | undefined) {
  const remote = isSupabaseRemote();
  const qc = useQueryClient();

  // Real-time: new messages + reaction/delete updates
  useEffect(() => {
    if (!remote || !conversationId || !process.env.EXPO_PUBLIC_SUPABASE_URL) return;

    const channel = supabase
      .channel(`direct_messages:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: ['messages', conversationId] }),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `conversation_id=eq.${conversationId}` },
        () => qc.invalidateQueries({ queryKey: ['messages', conversationId] }),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_reactions' },
        () => qc.invalidateQueries({ queryKey: ['messages', conversationId] }),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'message_reactions' },
        () => qc.invalidateQueries({ queryKey: ['messages', conversationId] }),
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [remote, conversationId, qc]);

  return useInfiniteQuery<
    RemoteDirectMessage[],
    Error,
    InfiniteData<RemoteDirectMessage[]>,
    unknown[],
    string | undefined
  >({
    queryKey: ['messages', conversationId],
    queryFn: async ({ pageParam }) =>
      conversationId ? fetchRemoteMessages(conversationId, 40, pageParam) : [],
    initialPageParam: undefined,
    getNextPageParam: firstPage =>
      firstPage.length === 40 ? firstPage[0]?.createdAt : undefined,
    enabled: remote && !!conversationId,
    staleTime: 30_000,
  });
}

// ── Send ──────────────────────────────────────────────────────────────────────

/** Send a text DM with optimistic update. */
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
        deletedAt: null,
        sharedEchoId: null,
        mediaUrl: null,
        reactions: [],
      };

      qc.setQueryData<InfiniteData<RemoteDirectMessage[]>>(
        ['messages', conversationId],
        old => old
          ? { ...old, pages: old.pages.map((p, i) => i === 0 ? [...p, optimistic] : p) }
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

// ── Mark read ─────────────────────────────────────────────────────────────────

/** Mark all incoming messages in a conversation as read. */
export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => markMessagesRead(conversationId),
    onSuccess: (_data, conversationId) => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
  });
}

// ── Delete message ────────────────────────────────────────────────────────────

/** Soft-delete own message with optimistic update. */
export function useDeleteMessage(conversationId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => deleteRemoteMessage(messageId),
    onMutate: async (messageId: string) => {
      await qc.cancelQueries({ queryKey: ['messages', conversationId] });
      qc.setQueryData<InfiniteData<RemoteDirectMessage[]>>(
        ['messages', conversationId],
        old => old
          ? {
              ...old,
              pages: old.pages.map(page =>
                page.map(msg =>
                  msg.id === messageId
                    ? { ...msg, deletedAt: new Date().toISOString() }
                    : msg,
                ),
              ),
            }
          : old,
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
  });
}

// ── Reactions ─────────────────────────────────────────────────────────────────

/** Add or remove an emoji reaction on a message. */
export function useToggleReaction(conversationId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      messageId, emoji, hasReacted,
    }: { messageId: string; emoji: string; hasReacted: boolean }) =>
      hasReacted
        ? removeMessageReaction(messageId, emoji)
        : addMessageReaction(messageId, emoji),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
  });
}

// ── Typing indicator ──────────────────────────────────────────────────────────

/** Subscribe to partner's typing events and expose a throttled send function. */
export function useTypingIndicator(
  conversationId: string | undefined,
  myUserId: string | undefined,
) {
  const [partnerIsTyping, setPartnerIsTyping] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!conversationId || !myUserId || !process.env.EXPO_PUBLIC_SUPABASE_URL) return;

    const channel = supabase.channel(`typing:${conversationId}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel
      .on(
        'broadcast',
        { event: 'typing' },
        ({ payload }: { payload: Record<string, unknown> }) => {
          if (payload?.userId === myUserId) return;
          setPartnerIsTyping(true);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => setPartnerIsTyping(false), 3000);
        },
      )
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (cooldownRef.current) clearTimeout(cooldownRef.current);
      channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [conversationId, myUserId]);

  /** Send a typing event — throttled to once per 2 s. */
  const sendTypingEvent = useCallback(() => {
    if (!channelRef.current || cooldownRef.current) return;
    void channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: myUserId },
    });
    cooldownRef.current = setTimeout(() => { cooldownRef.current = null; }, 2000);
  }, [myUserId]);

  return { partnerIsTyping, sendTypingEvent };
}
