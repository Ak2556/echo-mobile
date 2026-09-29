import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { fetchRemoteComments, getSessionUserId, insertRemoteComment, setRemoteCommentLike } from '../../lib/supabaseEchoApi';
import { withTimeout, isAppOnline } from '../../lib/net';
import { outbox } from '../../store/outbox';
import { Comment } from '../../types';
import { appendCommentCache } from '../../lib/queryCache';
import { commentRetryKey, createRetryIds } from '../../lib/retryIds';
import { randomUUID } from 'expo-crypto';
import { createLatestIntent } from '../../lib/latestIntent';
import { isTransientError } from '../../lib/mutationErrors';

// Ids held across a failed attempt so the resend (the compose screen keeps the
// draft on failure) reuses it; see lib/retryIds.
const commentIds = createRetryIds(randomUUID);

// Last tap wins, one request at a time per comment; see lib/latestIntent.
const commentLikeIntent = createLatestIntent<boolean>();
const setCommentLiked = (qc: ReturnType<typeof useQueryClient>, echoId: string, commentId: string, like: boolean) =>
  qc.setQueryData<Comment[]>(['comments', echoId], old =>
    (old ?? []).map(c =>
      c.id === commentId && c.isLiked !== like
        ? { ...c, isLiked: like, likes: like ? c.likes + 1 : Math.max(0, c.likes - 1) }
        : c,
    ),
  );

export function useEchoComments(echoId: string | undefined) {
  const remote = isSupabaseRemote();
  return useQuery({
    queryKey: ['comments', echoId],
    enabled: !!echoId && remote,
    staleTime: 1000 * 20,
    queryFn: async (): Promise<Comment[]> => {
      if (!echoId) return [];
      return fetchRemoteComments(echoId);
    },
  });
}

export function useAddRemoteComment(echoId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    // Compose screen shows its own error + preserves the draft — skip global toast.
    meta: { bespoke: true },
    mutationFn: async (input: { content: string; parentId?: string } | string) => {
      if (!echoId) throw new Error('No echo');
      const arg = typeof input === 'string' ? { content: input } : input;
      const key = commentRetryKey(echoId, arg.content, arg.parentId);
      const clientId = commentIds.claim(key);
      // Offline: queue it under the same id. The optimistic comment below
      // stays on screen and the outbox replays on reconnect; a duplicate id
      // there counts as sent, so a retry cannot post it twice.
      if (!isAppOnline()) {
        outbox.enqueue('comment', { echoId, content: arg.content, parentId: arg.parentId, clientId });
        commentIds.settle(key);
        return;
      }
      // The timeout abandons the wait, not the insert. On failure the id stays
      // held, so the resend finds a comment that landed late instead of
      // posting a second copy.
      await withTimeout(insertRemoteComment(echoId, arg.content, arg.parentId, clientId), 20000, 'comment');
      commentIds.settle(key);
    },
    onMutate: async (input) => {
      if (!echoId) return;
      const arg = typeof input === 'string' ? { content: input } : input;
      const uid = await getSessionUserId();
      const optimistic: Comment = {
        id: `pending-${Date.now()}`,
        echoId,
        userId: uid ?? 'me',
        username: 'you',
        displayName: 'You',
        avatarColor: '#3B82F6',
        isVerified: false,
        content: arg.content,
        likes: 0,
        isLiked: false,
        replyCount: 0,
        parentId: arg.parentId,
        createdAt: new Date().toISOString(),
      };
      appendCommentCache(qc, echoId, optimistic);
      return { optimisticId: optimistic.id };
    },
    onError: (_err, _vars, ctx) => {
      // Remove the optimistic comment immediately on failure instead of waiting for refetch
      if (echoId && ctx?.optimisticId) {
        qc.setQueryData<Comment[]>(['comments', echoId], old =>
          (old ?? []).filter(c => c.id !== ctx.optimisticId)
        );
      }
    },
    onSettled: () => {
      if (echoId) {
        qc.invalidateQueries({ queryKey: ['comments', echoId] });
        qc.invalidateQueries({ queryKey: ['feed'] });
      }
    },
  });
}

export function useToggleRemoteCommentLike(echoId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ commentId, like }: { commentId: string; like: boolean }) => {
      if (!isAppOnline()) { outbox.enqueue('commentLike', { commentId, like }); return; }
      await commentLikeIntent.send(commentId, like, v => setRemoteCommentLike(commentId, v), { retries: 3, shouldRetry: isTransientError });
    },
    onMutate: async ({ commentId, like }) => {
      if (!echoId) return;
      await qc.cancelQueries({ queryKey: ['comments', echoId] });
      setCommentLiked(qc, echoId, commentId, like);
    },
    // Undo only this comment, and only if no newer tap owns it. Restoring a
    // snapshot of the whole list here used to wipe out likes on other
    // comments made in the meantime.
    onError: (_err, { commentId, like }) => {
      if (echoId && commentLikeIntent.isIdle(commentId)) setCommentLiked(qc, echoId, commentId, !like);
    },
    onSettled: (_, __, vars) => {
      if (vars && !commentLikeIntent.isIdle(vars.commentId)) return;
      if (echoId) qc.invalidateQueries({ queryKey: ['comments', echoId] });
    },
  });
}
