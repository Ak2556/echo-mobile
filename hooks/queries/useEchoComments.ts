import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { fetchRemoteComments, insertRemoteComment } from '../../lib/supabaseEchoApi';
import { Comment, FeedItem } from '../../types';

export function useEchoComments(echoId: string | undefined) {
  const remote = isSupabaseRemote();
  return useQuery({
    queryKey: ['comments', echoId],
    enabled: !!echoId && remote,
    staleTime: 30_000,
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
    onSuccess: () => {
      if (!echoId) return;
      // Patch comment count in-place — avoids a full feed refetch.
      qc.setQueriesData<FeedItem[]>({ queryKey: ['feed'] }, (old) =>
        old?.map(item =>
          item.id === echoId
            ? { ...item, commentCount: item.commentCount + 1 }
            : item
        )
      );
    },
    onSettled: () => {
      if (echoId) {
        qc.invalidateQueries({ queryKey: ['comments', echoId] });
      }
    },
  });
}
