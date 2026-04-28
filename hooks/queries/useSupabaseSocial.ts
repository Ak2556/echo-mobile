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
      const prev = qc.getQueryData<FeedItem[]>(['feed']);
      qc.setQueryData<FeedItem[]>(['feed'], old =>
        old?.map(item =>
          item.id === echoId
            ? { ...item, isLiked: like, likes: item.likes + (like ? 1 : -1) }
            : item,
        ),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['feed'], ctx.prev);
      showToast('Action failed. Please try again.', '❌');
    },
    // No onSettled invalidation — useFeed's select() applies likedIds reactively
  });
}

export function useToggleRemoteBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ echoId, bookmark }: { echoId: string; bookmark: boolean }) =>
      setRemoteBookmark(echoId, bookmark),
    onMutate: async ({ echoId, bookmark }) => {
      await qc.cancelQueries({ queryKey: ['feed'] });
      const prev = qc.getQueryData<FeedItem[]>(['feed']);
      qc.setQueryData<FeedItem[]>(['feed'], old =>
        old?.map(item =>
          item.id === echoId ? { ...item, isBookmarked: bookmark } : item,
        ),
      );
      // Also patch the bookmarks cache if it exists
      const prevBm = qc.getQueryData<FeedItem[]>(['bookmarks']);
      if (prevBm) {
        if (!bookmark) {
          qc.setQueryData<FeedItem[]>(['bookmarks'], old =>
            old?.filter(item => item.id !== echoId),
          );
        }
      }
      return { prev, prevBm };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['feed'], ctx.prev);
      if (ctx?.prevBm) qc.setQueryData(['bookmarks'], ctx.prevBm);
      showToast('Action failed. Please try again.', '❌');
    },
  });
}

export function useToggleRemoteFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, follow }: { userId: string; follow: boolean }) =>
      setRemoteFollow(userId, follow),
    onSettled: (_data, _err, vars) => {
      // Follow changes affect counts and feed ordering — still invalidate, but targeted
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
