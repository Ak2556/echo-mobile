import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isSupabaseRemote } from '../../lib/remoteConfig';
import { fetchMyFollowSets } from '../../lib/supabaseEchoApi';
import { useToggleRemoteFollow } from '../../src/features/feed/api/useSupabaseSocial';
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

  // Guard against corrupted MMKV cache (where Set previously stringified to {})
  const safeRemoteArray = Array.isArray(remoteList) ? remoteList : [];
  const following = remote ? new Set<string>(safeRemoteArray) : new Set(storeFollowingIds);

  const isFollowing = useCallback((id: string) => following.has(id), [following]);

  const toggle = useCallback((id: string) => {
    if (!remote) { storeToggle(id); return; }
    const willFollow = !following.has(id);
    // Optimistic: flip the shared list now; onSettled invalidation reconciles.
    qc.setQueryData<string[]>(['my-following'], (old) => {
      const nextSet = new Set(Array.isArray(old) ? old : []);
      if (willFollow) nextSet.add(id); else nextSet.delete(id);
      return Array.from(nextSet);
    });
    mut.mutate({ userId: id, follow: willFollow });
  }, [remote, following, qc, storeToggle, mut]);

  return {
    isFollowing,
    toggle,
    pendingId: mut.isPending ? mut.variables?.userId : undefined,
  };
}
