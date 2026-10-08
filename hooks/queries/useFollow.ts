import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isSupabaseRemote } from '../../lib/core/remoteConfig';
import { fetchMyFollowRequestIds, fetchMyFollowSets } from '../../lib/supabaseEchoApi';
import { useToggleRemoteFollow } from '../useSupabaseSocial';
import { useAppStore } from '../../store/useAppStore';

/**
 * Unified follow state + toggle for any "Follow" button in the app (feed cards,
 * explore, connection lists, profiles). Works in both local/mock and remote
 * modes, backed by a single shared ['my-following'] query so every button stays
 * in sync. Remote toggles are optimistic and reconcile on settle.
 */
export function useFollow() {
  const remote = isSupabaseRemote();
  const qc = useQueryClient();
  const storeFollowingIds = useAppStore(s => s.followingIds);
  const storeToggle = useAppStore(s => s.toggleFollow);
  const mut = useToggleRemoteFollow();

  const { data: remoteList } = useQuery({
    queryKey: ['my-following'],
    enabled: remote,
    staleTime: 60_000,
    queryFn: async () => (await fetchMyFollowSets()).following,
  });

  // People the viewer has asked to follow (private accounts) and is waiting on.
  const { data: requestedList } = useQuery({
    queryKey: ['my-follow-requests'],
    enabled: remote,
    staleTime: 60_000,
    queryFn: fetchMyFollowRequestIds,
  });
  const requested = new Set<string>(Array.isArray(requestedList) ? requestedList : []);

  // Guard against corrupted MMKV cache (where Set previously stringified to {})
  const safeRemoteArray = Array.isArray(remoteList) ? remoteList : [];
  const following = remote ? new Set<string>(safeRemoteArray) : new Set(storeFollowingIds);

  const isFollowing = useCallback((id: string) => following.has(id), [following]);
  const isRequested = useCallback((id: string) => requested.has(id), [requested]);

  /**
   * Tap on a Follow button. `isPrivate` is a hint for the label only: when the
   * screen already knows the account is private the button goes straight to
   * "Requested". Tapping it again withdraws the request.
   */
  const toggle = useCallback((id: string, opts: { isPrivate?: boolean } = {}) => {
    if (!remote) { storeToggle(id); return; }
    const wasRequested = requested.has(id);
    const willFollow = !following.has(id) && !wasRequested;
    const asRequest = willFollow && opts.isPrivate === true;
    // Optimistic: flip the shared lists now; onSettled invalidation reconciles.
    qc.setQueryData<string[]>(['my-following'], (old) => {
      const nextSet = new Set(Array.isArray(old) ? old : []);
      if (willFollow && !asRequest) nextSet.add(id); else nextSet.delete(id);
      return Array.from(nextSet);
    });
    qc.setQueryData<string[]>(['my-follow-requests'], (old) => {
      const nextSet = new Set(Array.isArray(old) ? old : []);
      if (asRequest) nextSet.add(id); else nextSet.delete(id);
      return Array.from(nextSet);
    });
    mut.mutate({ userId: id, follow: willFollow, mode: asRequest ? 'request' : wasRequested ? 'cancel-request' : undefined });
  }, [remote, following, requested, qc, storeToggle, mut]);

  return {
    isFollowing,
    isRequested,
    toggle,
    pendingId: mut.isPending ? mut.variables?.userId : undefined,
  };
}
