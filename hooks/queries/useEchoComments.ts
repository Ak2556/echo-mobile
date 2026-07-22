import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { fetchRemoteComments, getSessionUserId, insertRemoteComment, setRemoteCommentLike } from '../../lib/supabaseEchoApi';
import { Comment } from '../../types';
import { appendCommentCache } from '../../lib/queryCache';

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
      await insertRemoteComment(echoId, arg.content, arg.parentId);
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
      await setRemoteCommentLike(commentId, like);
    },
    onMutate: async ({ commentId, like }) => {
      if (!echoId) return;
      await qc.cancelQueries({ queryKey: ['comments', echoId] });
      const previous = qc.getQueryData<Comment[]>(['comments', echoId]);
      qc.setQueryData<Comment[]>(['comments', echoId], old =>
        (old ?? []).map(c =>
          c.id === commentId
            ? { ...c, isLiked: like, likes: like ? c.likes + 1 : Math.max(0, c.likes - 1) }
            : c,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (echoId && ctx?.previous) {
        qc.setQueryData(['comments', echoId], ctx.previous);
      }
    },
    onSettled: () => {
      if (echoId) qc.invalidateQueries({ queryKey: ['comments', echoId] });
    },
  });
}
