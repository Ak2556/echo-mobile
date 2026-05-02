import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { fetchRemoteComments, getSessionUserId, insertRemoteComment } from '../../lib/supabaseEchoApi';
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
    mutationFn: async (content: string) => {
      if (!echoId) throw new Error('No echo');
      await insertRemoteComment(echoId, content);
    },
    onMutate: async (content) => {
      if (!echoId) return;
      const uid = await getSessionUserId();
      const optimistic: Comment = {
        id: `pending-${Date.now()}`,
        echoId,
        userId: uid ?? 'me',
        username: 'you',
        displayName: 'You',
        avatarColor: '#3B82F6',
        isVerified: false,
        content,
        likes: 0,
        isLiked: false,
        replyCount: 0,
        createdAt: new Date().toISOString(),
      };
      appendCommentCache(qc, echoId, optimistic);
      return { optimisticId: optimistic.id };
    },
    onSettled: () => {
      if (echoId) {
        qc.invalidateQueries({ queryKey: ['comments', echoId] });
        qc.invalidateQueries({ queryKey: ['feed'] });
      }
    },
  });
}
