import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  insertRemoteEcho,
  setRemoteBookmark,
  setRemoteFollow,
  setRemoteLike,
} from '../../lib/supabaseEchoApi';

export function useToggleRemoteLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ echoId, like }: { echoId: string; like: boolean }) => {
      await setRemoteLike(echoId, like);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['bookmarks'] });
    },
  });
}

export function useToggleRemoteBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ echoId, bookmark }: { echoId: string; bookmark: boolean }) => {
      await setRemoteBookmark(echoId, bookmark);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['bookmarks'] });
    },
  });
}

export function useToggleRemoteFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, follow }: { userId: string; follow: boolean }) => {
      await setRemoteFollow(userId, follow);
    },
    onSettled: (_, __, vars) => {
      qc.invalidateQueries({ queryKey: ['feed'] });
      if (vars?.userId) qc.invalidateQueries({ queryKey: ['profile', vars.userId] });
      qc.invalidateQueries({ queryKey: ['followers'] });
    },
  });
}

export function usePublishRemoteEcho() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { authorId: string; prompt: string; response: string }) => {
      await insertRemoteEcho(params);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}
