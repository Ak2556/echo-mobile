import { useMutation, useQueryClient } from '@tanstack/react-query';
import { setRemoteBlock, setRemoteMute } from '../../lib/supabaseEchoApi';
import { useAppStore } from '../../store/useAppStore';

/**
 * Remote block mutation.
 * - Optimistically updates Zustand blockedIds (used by useFeed for filtering).
 * - Writes to user_blocks table in Supabase.
 * - Invalidates feed on settle so filtered content disappears.
 */
export function useToggleRemoteBlock() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ targetUserId, block }: { targetUserId: string; block: boolean }) =>
      setRemoteBlock(targetUserId, block),
    onMutate: ({ targetUserId, block }) => {
      // Optimistic: update local store so feed filters immediately
      const currentBlocked = useAppStore.getState().blockedIds;
      const isCurrentlyBlocked = currentBlocked.includes(targetUserId);
      // Only toggle if the desired state differs from current
      if (block && !isCurrentlyBlocked) {
        useAppStore.getState().toggleBlock(targetUserId);
      } else if (!block && isCurrentlyBlocked) {
        useAppStore.getState().toggleBlock(targetUserId);
      }
      return { wasBlocked: isCurrentlyBlocked };
    },
    onError: (_e, { targetUserId }, ctx) => {
      // Roll back: toggle back to original state
      const isCurrentlyBlocked = useAppStore.getState().blockedIds.includes(targetUserId);
      if (isCurrentlyBlocked !== ctx?.wasBlocked) {
        useAppStore.getState().toggleBlock(targetUserId);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

/**
 * Remote mute mutation.
 * - Optimistically updates Zustand mutedIds.
 * - Writes to user_mutes table in Supabase.
 */
export function useToggleRemoteMute() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ targetUserId, mute }: { targetUserId: string; mute: boolean }) =>
      setRemoteMute(targetUserId, mute),
    onMutate: ({ targetUserId, mute }) => {
      const currentMuted = useAppStore.getState().mutedIds;
      const isCurrentlyMuted = currentMuted.includes(targetUserId);
      if (mute && !isCurrentlyMuted) {
        useAppStore.getState().toggleMute(targetUserId);
      } else if (!mute && isCurrentlyMuted) {
        useAppStore.getState().toggleMute(targetUserId);
      }
      return { wasMuted: isCurrentlyMuted };
    },
    onError: (_e, { targetUserId }, ctx) => {
      const isCurrentlyMuted = useAppStore.getState().mutedIds.includes(targetUserId);
      if (isCurrentlyMuted !== ctx?.wasMuted) {
        useAppStore.getState().toggleMute(targetUserId);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
