import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FeedItem } from '../../types';
import {
  insertRemoteEcho,
  setRemoteBookmark,
  setRemoteFollow,
  setRemoteLike,
} from '../../lib/supabaseEchoApi';
import { showToast } from '../../components/ui/Toast';

export function useToggleRemoteLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ echoId, like }: { echoId: string; like: boolean }) =>
      setRemoteLike(echoId, like),
    onMutate: async ({ echoId, like }) => {
      await qc.cancelQueries({ queryKey: ['feed'] });
      // setQueriesData (plural) patches all ['feed', ...] variants — not just exact ['feed']
      qc.setQueriesData<FeedItem[]>({ queryKey: ['feed'] }, old =>
        old?.map(item =>
          item.id === echoId
            ? { ...item, isLiked: like, likes: item.likes + (like ? 1 : -1) }
            : item,
        ),
      );
    },
    onError: () => {
      // Refetch the real data rather than trying to restore a snapshot
      qc.invalidateQueries({ queryKey: ['feed'] });
      showToast('Action failed. Please try again.', '❌');
    },
  });
}

export function useToggleRemoteBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ echoId, bookmark }: { echoId: string; bookmark: boolean }) =>
      setRemoteBookmark(echoId, bookmark),
    onMutate: async ({ echoId, bookmark }) => {
      await qc.cancelQueries({ queryKey: ['feed'] });
      await qc.cancelQueries({ queryKey: ['bookmarks'] });

      qc.setQueriesData<FeedItem[]>({ queryKey: ['feed'] }, old =>
        old?.map(item => item.id === echoId ? { ...item, isBookmarked: bookmark } : item),
      );

      // Keep bookmarks list in sync for both add and remove
      qc.setQueriesData<FeedItem[]>({ queryKey: ['bookmarks'] }, old => {
        if (!old) return old;
        if (!bookmark) return old.filter(item => item.id !== echoId);
        // Adding: item may already be in the list; only append if missing
        const exists = old.some(item => item.id === echoId);
        if (exists) return old;
        // We don't have the full item here, so invalidate after settle instead
        return old;
      });
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['bookmarks'] });
      showToast('Action failed. Please try again.', '❌');
    },
    onSettled: () => {
      // Ensure bookmarks cache stays in sync after the server round-trip
      qc.invalidateQueries({ queryKey: ['bookmarks'] });
    },
  });
}

export function useToggleRemoteFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, follow }: { userId: string; follow: boolean }) =>
      setRemoteFollow(userId, follow),
    onSettled: (_data, _err, vars) => {
      if (vars?.userId) qc.invalidateQueries({ queryKey: ['profile', vars.userId] });
      qc.invalidateQueries({ queryKey: ['followers', vars?.userId] });
    },
  });
}

export function usePublishRemoteEcho() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: { authorId: string; prompt: string; response: string }) =>
      insertRemoteEcho(params),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}
