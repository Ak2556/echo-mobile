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
  sendRemoteDMToConversation,
  sendRemoteDMLink,
  sendRemoteDMLinkToConversation,
  sendRemoteDMContact,
  sendRemoteDMContactToConversation,
  sendRemoteDMEcho,
  sendRemoteDMEchoToConversation,
  sendDMImage,
  sendDMImageToConversation,
  sendDMVoice,
  sendDMVoiceToConversation,
  editRemoteMessage,
  pinDMMessage,
  getOrCreateRemoteConversation,
  createRemoteGroupConversation,
  markMessagesRead,
  setDMPref,
  forwardDMMessage,
  deleteRemoteMessage,
  addMessageReaction,
  removeMessageReaction,
  getSessionUserId,
  RemoteConversation,
  RemoteDirectMessage,
} from '../../lib/supabaseEchoApi';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { supabase } from '../../lib/supabase';

// Conversations list
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
        .channel(`dm_conversations:${uid}:${Math.random().toString(36).slice(2, 10)}`)
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

// Single conversation
/** Fetch a conversation header by UUID (used when local store doesn't have it). */
export function useRemoteConversation(conversationId: string | undefined) {
  return useQuery<RemoteConversation | null>({
    queryKey: ['conversation', conversationId],
    queryFn: () => fetchConversationById(conversationId!),
    enabled: !!conversationId,
    staleTime: 5 * 60_000,
  });
}

// Messages
/** Messages in a conversation — infinite scroll (load older on demand). */
export function useRemoteMessages(conversationId: string | undefined) {
  const remote = isSupabaseRemote();
  const qc = useQueryClient();

  // Real-time: new messages + reaction/delete updates
  useEffect(() => {
    if (!remote || !conversationId || !process.env.EXPO_PUBLIC_SUPABASE_URL) return;

    const channel = supabase
      .channel(`direct_messages:${conversationId}:${Math.random().toString(36).slice(2, 10)}`)
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

// Start conversation
/** Upsert a dm_conversation in Supabase and return its UUID — no message sent. */
export function useStartRemoteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (recipientId: string) => getOrCreateRemoteConversation(recipientId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}

export function useCreateGroupConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ title, memberIds }: { title: string; memberIds: string[] }) =>
      createRemoteGroupConversation(title, memberIds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}

// Send
/** Send a text DM with optimistic update. Accepts optional replyToId for quoted replies. */
export function useSendRemoteDM(
  conversationId: string | undefined,
  recipientId: string | undefined,
  isGroup = false,
) {
  const qc = useQueryClient();

  return useMutation({
    // Bespoke failure UX: the bubble flips to a "failed — tap to retry" state,
    // so skip the global error toast.
    meta: { bespoke: true },
    mutationFn: ({ content, replyToId }: { content: string; replyToId?: string }) => {
      if (isGroup) {
        if (!conversationId) throw new Error('No conversation');
        return sendRemoteDMToConversation(conversationId, content, replyToId);
      }
      if (!recipientId) throw new Error('No recipient');
      return sendRemoteDM(recipientId, content, replyToId);
    },
    onMutate: async ({ content, replyToId }) => {
      await qc.cancelQueries({ queryKey: ['messages', conversationId] });
      const snapshot = qc.getQueryData(['messages', conversationId]);

      const uid = await getSessionUserId();
      const optimisticId = `pending-${Date.now()}`;
      const optimistic: RemoteDirectMessage = {
        id: optimisticId,
        conversationId: conversationId ?? '',
        senderId: uid ?? 'me',
        content,
        kind: 'text',
        createdAt: new Date().toISOString(),
        readAt: null,
        deletedAt: null,
        editedAt: null,
        sharedEchoId: null,
        mediaUrl: null,
        replyToId: replyToId ?? null,
        replyToContent: null,
        replyToSenderId: null,
        replyToKind: null,
        replyToDeleted: false,
        reactions: [],
      };

      qc.setQueryData<InfiniteData<RemoteDirectMessage[]>>(
        ['messages', conversationId],
        old => old
          ? { ...old, pages: old.pages.map((p, i) => i === 0 ? [...p, optimistic] : p) }
          : old,
      );
      return { snapshot, optimisticId };
    },
    onError: (_, __, ctx) => {
      // Don't roll back silently — keep the bubble, flagged as failed, so the
      // user can tap to retry. (The `failed-` id prefix drives the UI.)
      if (!ctx?.optimisticId) return;
      qc.setQueryData<InfiniteData<RemoteDirectMessage[]>>(
        ['messages', conversationId],
        old => old
          ? {
              ...old,
              pages: old.pages.map(page =>
                page.map(msg =>
                  msg.id === ctx.optimisticId
                    ? { ...msg, id: ctx.optimisticId.replace('pending-', 'failed-') }
                    : msg,
                ),
              ),
            }
          : old,
      );
    },
    onSettled: (_data, error) => {
      // A failed send must keep its local 'failed-' bubble: skip the refetch
      // that would wipe it. Successful sends refresh as usual.
      if (!error) {
        qc.invalidateQueries({ queryKey: ['messages', conversationId] });
        qc.invalidateQueries({ queryKey: ['conversations'] });
      }
    },
  });
}

/** Drop a locally-cached (failed/optimistic) message — used before a retry. */
export function useDiscardLocalMessage(conversationId: string | undefined) {
  const qc = useQueryClient();
  return useCallback((messageId: string) => {
    qc.setQueryData<InfiniteData<RemoteDirectMessage[]>>(
      ['messages', conversationId],
      old => old
        ? { ...old, pages: old.pages.map(page => page.filter(m => m.id !== messageId)) }
        : old,
    );
  }, [qc, conversationId]);
}

// Forward
/** Copy a message into another conversation. */
export function useForwardMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, recipientId }: { messageId: string; recipientId: string }) =>
      forwardDMMessage(messageId, recipientId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['conversations'] });
      qc.invalidateQueries({ queryKey: ['messages', res.conversationId] });
    },
  });
}

function appendOptimisticMessage(
  qc: ReturnType<typeof useQueryClient>,
  conversationId: string | undefined,
  optimistic: RemoteDirectMessage,
) {
  qc.setQueryData<InfiniteData<RemoteDirectMessage[]>>(
    ['messages', conversationId],
    old => old
      ? { ...old, pages: old.pages.map((p, i) => i === 0 ? [...p, optimistic] : p) }
      : old,
  );
}

// Send image
/** Upload a photo and send it as an image-kind DM with optimistic placeholder. */
export function useSendImageDM(
  conversationId: string | undefined,
  recipientId: string | undefined,
  isGroup = false,
) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ uri, mimeType, replyToId, caption }: { uri: string; mimeType: string; replyToId?: string; caption?: string }) => {
      if (isGroup) {
        if (!conversationId) throw new Error('No conversation');
        return sendDMImageToConversation(conversationId, uri, mimeType, replyToId, caption);
      }
      if (!recipientId) throw new Error('No recipient');
      return sendDMImage(recipientId, uri, mimeType, replyToId, caption);
    },
    onMutate: async ({ uri, caption }) => {
      await qc.cancelQueries({ queryKey: ['messages', conversationId] });
      const snapshot = qc.getQueryData(['messages', conversationId]);

      const uid = await getSessionUserId();
      const optimistic: RemoteDirectMessage = {
        id: `pending-img-${Date.now()}`,
        conversationId: conversationId ?? '',
        senderId: uid ?? 'me',
        content: caption?.trim() ? caption.trim() : null,
        kind: 'image',
        createdAt: new Date().toISOString(),
        readAt: null,
        deletedAt: null,
        editedAt: null,
        sharedEchoId: null,
        mediaUrl: uri, // local URI until confirmed
        replyToId: null,
        replyToContent: null,
        replyToSenderId: null,
        replyToKind: null,
        replyToDeleted: false,
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
      if (ctx?.snapshot !== undefined) qc.setQueryData(['messages', conversationId], ctx.snapshot);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

// Send voice
/** Record-and-send voice note: optimistic bubble with the local file URI. */
export function useSendVoiceDM(
  conversationId: string | undefined,
  recipientId: string | undefined,
  isGroup = false,
) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ uri, durationSec, replyToId }: { uri: string; durationSec: number; replyToId?: string }) => {
      if (isGroup) {
        if (!conversationId) throw new Error('No conversation');
        return sendDMVoiceToConversation(conversationId, uri, durationSec, replyToId);
      }
      if (!recipientId) throw new Error('No recipient');
      return sendDMVoice(recipientId, uri, durationSec, replyToId);
    },
    onMutate: async ({ uri, durationSec }) => {
      await qc.cancelQueries({ queryKey: ['messages', conversationId] });
      const snapshot = qc.getQueryData(['messages', conversationId]);
      const uid = await getSessionUserId();
      appendOptimisticMessage(qc, conversationId, {
        id: `pending-voice-${Date.now()}`,
        conversationId: conversationId ?? '',
        senderId: uid ?? 'me',
        content: String(Math.max(1, Math.round(durationSec))),
        kind: 'voice',
        createdAt: new Date().toISOString(),
        readAt: null,
        deletedAt: null,
        editedAt: null,
        sharedEchoId: null,
        mediaUrl: uri, // local file until the upload confirms
        replyToId: null,
        replyToContent: null,
        replyToSenderId: null,
        replyToKind: null,
        replyToDeleted: false,
        reactions: [],
      });
      return { snapshot };
    },
    onError: (_, __, ctx) => {
      if (ctx?.snapshot !== undefined) qc.setQueryData(['messages', conversationId], ctx.snapshot);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useSendLinkDM(
  conversationId: string | undefined,
  recipientId: string | undefined,
  isGroup = false,
) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ url, title, subtitle, replyToId }: { url: string; title?: string; subtitle?: string; replyToId?: string }) => {
      if (isGroup) {
        if (!conversationId) throw new Error('No conversation');
        return sendRemoteDMLinkToConversation(conversationId, url, title, subtitle, replyToId);
      }
      if (!recipientId) throw new Error('No recipient');
      return sendRemoteDMLink(recipientId, url, title, subtitle, replyToId);
    },
    onMutate: async ({ url, title, subtitle, replyToId }) => {
      await qc.cancelQueries({ queryKey: ['messages', conversationId] });
      const snapshot = qc.getQueryData(['messages', conversationId]);
      const uid = await getSessionUserId();
      appendOptimisticMessage(qc, conversationId, {
        id: `pending-link-${Date.now()}`,
        conversationId: conversationId ?? '',
        senderId: uid ?? 'me',
        content: JSON.stringify({ url, title: title ?? url, subtitle }),
        kind: 'link',
        createdAt: new Date().toISOString(),
        readAt: null,
        deletedAt: null,
        editedAt: null,
        sharedEchoId: null,
        mediaUrl: null,
        replyToId: replyToId ?? null,
        replyToContent: null,
        replyToSenderId: null,
        replyToKind: null,
        replyToDeleted: false,
        reactions: [],
      });
      return { snapshot };
    },
    onError: (_, __, ctx) => {
      if (ctx?.snapshot !== undefined) qc.setQueryData(['messages', conversationId], ctx.snapshot);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useSendContactDM(
  conversationId: string | undefined,
  recipientId: string | undefined,
  isGroup = false,
) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ contact, replyToId }: {
      contact: { userId: string; username: string; displayName: string; avatarColor: string; avatarUrl?: string | null };
      replyToId?: string;
    }) => {
      if (isGroup) {
        if (!conversationId) throw new Error('No conversation');
        return sendRemoteDMContactToConversation(conversationId, contact, replyToId);
      }
      if (!recipientId) throw new Error('No recipient');
      return sendRemoteDMContact(recipientId, contact, replyToId);
    },
    onMutate: async ({ contact, replyToId }) => {
      await qc.cancelQueries({ queryKey: ['messages', conversationId] });
      const snapshot = qc.getQueryData(['messages', conversationId]);
      const uid = await getSessionUserId();
      appendOptimisticMessage(qc, conversationId, {
        id: `pending-contact-${Date.now()}`,
        conversationId: conversationId ?? '',
        senderId: uid ?? 'me',
        content: JSON.stringify({ type: 'contact', ...contact }),
        kind: 'link',
        createdAt: new Date().toISOString(),
        readAt: null,
        deletedAt: null,
        editedAt: null,
        sharedEchoId: null,
        mediaUrl: null,
        replyToId: replyToId ?? null,
        replyToContent: null,
        replyToSenderId: null,
        replyToKind: null,
        replyToDeleted: false,
        reactions: [],
      });
      return { snapshot };
    },
    onError: (_, __, ctx) => {
      if (ctx?.snapshot !== undefined) qc.setQueryData(['messages', conversationId], ctx.snapshot);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useSendEchoDM(
  conversationId: string | undefined,
  recipientId: string | undefined,
  isGroup = false,
) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ echo, intro, replyToId }: {
      echo: { id: string; title: string; preview?: string; author?: string };
      intro?: string;
      replyToId?: string;
    }) => {
      if (isGroup) {
        if (!conversationId) throw new Error('No conversation');
        return sendRemoteDMEchoToConversation(conversationId, echo, intro, replyToId);
      }
      if (!recipientId) throw new Error('No recipient');
      return sendRemoteDMEcho(recipientId, echo, intro, replyToId);
    },
    onMutate: async ({ echo, intro, replyToId }) => {
      await qc.cancelQueries({ queryKey: ['messages', conversationId] });
      const snapshot = qc.getQueryData(['messages', conversationId]);
      const uid = await getSessionUserId();
      appendOptimisticMessage(qc, conversationId, {
        id: `pending-echo-${Date.now()}`,
        conversationId: conversationId ?? '',
        senderId: uid ?? 'me',
        content: JSON.stringify({ title: echo.title, preview: echo.preview, author: echo.author, intro }),
        kind: 'echo',
        createdAt: new Date().toISOString(),
        readAt: null,
        deletedAt: null,
        editedAt: null,
        sharedEchoId: echo.id,
        mediaUrl: null,
        replyToId: replyToId ?? null,
        replyToContent: null,
        replyToSenderId: null,
        replyToKind: null,
        replyToDeleted: false,
        reactions: [],
      });
      return { snapshot };
    },
    onError: (_, __, ctx) => {
      if (ctx?.snapshot !== undefined) qc.setQueryData(['messages', conversationId], ctx.snapshot);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

// Edit
/** Edit the text of an own message. */
export function useEditMessage(conversationId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId, content }: { messageId: string; content: string }) =>
      editRemoteMessage(messageId, content),
    onMutate: async ({ messageId, content }) => {
      await qc.cancelQueries({ queryKey: ['messages', conversationId] });
      const snapshot = qc.getQueryData(['messages', conversationId]);
      const now = new Date().toISOString();
      qc.setQueryData<InfiniteData<RemoteDirectMessage[]>>(
        ['messages', conversationId],
        old => old
          ? {
              ...old,
              pages: old.pages.map(page =>
                page.map(msg =>
                  msg.id === messageId ? { ...msg, content, editedAt: now } : msg,
                ),
              ),
            }
          : old,
      );
      return { snapshot };
    },
    onError: (_, __, ctx) => {
      if (ctx?.snapshot !== undefined) qc.setQueryData(['messages', conversationId], ctx.snapshot);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['messages', conversationId] }),
  });
}

// Pin
/** Pin or unpin a message in this conversation. */
export function usePinMessage(conversationId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ messageId }: { messageId: string | null }) =>
      conversationId ? pinDMMessage(conversationId, messageId) : Promise.resolve(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['conversation', conversationId] });
      qc.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

// Conversation prefs
/** Mute or archive a conversation for the current user. */
export function useSetDMPref() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ conversationId, patch }: { conversationId: string; patch: { muted?: boolean; archived?: boolean } }) =>
      setDMPref(conversationId, patch),
    onMutate: async ({ conversationId, patch }) => {
      await qc.cancelQueries({ queryKey: ['conversations'] });
      const snapshot = qc.getQueryData(['conversations']);
      qc.setQueryData<RemoteConversation[]>(['conversations'], old =>
        old?.map(c => (c.id === conversationId ? { ...c, ...patch } : c)) ?? old,
      );
      return { snapshot };
    },
    onError: (_, __, ctx) => {
      if (ctx?.snapshot !== undefined) qc.setQueryData(['conversations'], ctx.snapshot);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
}

// Mark read
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

// Delete message
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

// Reactions
/** Add or remove a reaction on a message. */
export function useToggleReaction(conversationId: string | undefined) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      messageId, reactionValue, hasReacted,
    }: { messageId: string; reactionValue: string; hasReacted: boolean }) =>
      hasReacted
        ? removeMessageReaction(messageId, reactionValue)
        : addMessageReaction(messageId, reactionValue),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['messages', conversationId] });
    },
  });
}

// Typing indicator
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

    // The topic must be IDENTICAL for both participants — broadcasts only
    // reach subscribers of the same channel name. (A per-client random
    // suffix here silently isolated each user on their own topic.)
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
