import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isSupabaseRemote } from '../../lib/core/remoteConfig';
import {
  fetchIncomingFollowRequests,
  respondToFollowRequest,
  type IncomingFollowRequest,
} from '../../lib/supabaseEchoApi';

const KEY = ['follow-requests'] as const;

/** People asking to follow the viewer's private account, newest first. */
export function useIncomingFollowRequests() {
  return useQuery({
    queryKey: KEY,
    enabled: isSupabaseRemote(),
    staleTime: 30_000,
    queryFn: fetchIncomingFollowRequests,
  });
}

/**
 * Approve or decline. The row leaves the list at once; if the server refuses, the
 * list is refetched and the row comes back. An approval also changes the
 * viewer's follower list and count, so those are refreshed too.
 */
export function useRespondFollowRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requesterId, accept }: { requesterId: string; accept: boolean }) =>
      respondToFollowRequest(requesterId, accept),
    onMutate: async ({ requesterId }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const previous = qc.getQueryData<IncomingFollowRequest[]>(KEY);
      qc.setQueryData<IncomingFollowRequest[]>(KEY, old => (old ?? []).filter(r => r.requesterId !== requesterId));
      return { previous };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(KEY, ctx.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['followers'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
