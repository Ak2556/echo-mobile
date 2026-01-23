import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  insertRemoteEcho,
  setRemoteBookmark,
  setRemoteFollow,
  setRemoteLike,
  setRemoteRepost,
} from '../../lib/supabaseEchoApi';
import { patchBookmarkCaches, patchFollowCaches, patchLikeCaches, patchRepostCaches } from '../../lib/queryCache';
import { awardXp } from '../../lib/retention';

export function useToggleRemoteLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ echoId, like }: { echoId: string; like: boolean }) => {
      await setRemoteLike(echoId, like);
    },
    onMutate: async ({ echoId, like }) => {
      patchLikeCaches(qc, echoId, like);
      return { echoId };
    },
    onSettled: (_, __, vars) => {
      qc.invalidateQueries({ queryKey: ['feed'] });
      if (vars?.echoId) qc.invalidateQueries({ queryKey: ['comments', vars.echoId] });
    },
  });
}

export function useToggleRemoteBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ echoId, bookmark }: { echoId: string; bookmark: boolean }) => {
      await setRemoteBookmark(echoId, bookmark);
    },
    onMutate: async ({ echoId, bookmark }) => {
      patchBookmarkCaches(qc, echoId, bookmark);
      return { echoId };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['bookmarks'] });
    },
  });
}

export function useToggleRemoteRepost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ echoId, repost }: { echoId: string; repost: boolean }) => {
      await setRemoteRepost(echoId, repost);
    },
    onMutate: async ({ echoId, repost }) => {
      patchRepostCaches(qc, echoId, repost);
      return { echoId };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['bookmarks'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useToggleRemoteFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, follow }: { userId: string; follow: boolean }) => {
      await setRemoteFollow(userId, follow);
    },
    onMutate: async ({ userId, follow }) => {
      patchFollowCaches(qc, userId, follow);
      return { userId };
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
    mutationFn: async (params: {
      authorId: string;
      prompt: string;
      response: string;
      title?: string;
      mediaUrls?: string[];
      parentEchoId?: string;
      sourceConversationId?: string;
      conversationSnapshot?: { role: 'user' | 'assistant'; content: string }[];
    }) => insertRemoteEcho(params),
    onSuccess: (_, vars) => {
      // Reward XP for the publish. Remixes earn slightly less than fresh
      // posts so the gamification doesn't accidentally encourage low-effort
      // forking. Retention is local-only; backend mirror can come later.
      awardXp(vars.parentEchoId ? 'publishRemix' : 'publishEcho');
    },
    onSettled: (_, __, vars) => {
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['semantic-feed'] });
      qc.invalidateQueries({ queryKey: ['trending-evolutions'] });
      if (vars?.parentEchoId) {
        qc.invalidateQueries({ queryKey: ['remix-tree', vars.parentEchoId] });
        qc.invalidateQueries({ queryKey: ['echo', vars.parentEchoId] });
      }
    },
  });
}
