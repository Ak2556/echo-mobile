import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  insertRemoteEcho,
  setRemoteBookmark,
  setRemoteCommentReaction,
  setRemoteEchoReaction,
  setRemoteFollow,
  setRemoteLike,
  setRemoteRepost,
} from '../../lib/supabaseEchoApi';
import type { PerspectiveType } from '../../types';
import { patchBookmarkCaches, patchFollowCaches, patchLikeCaches, patchRepostCaches } from '../../lib/queryCache';
import { awardXp } from '../../lib/retention';
import type { EchoReaction } from '../../types';
import { isAppOnline } from '../../lib/net';
import { outbox } from '../../store/outbox';
import { isTransientError } from '../../lib/mutationErrors';

// Toggles are idempotent (DB unique keys + duplicate-swallow) so they can
// safely auto-retry a transient online failure without risking a duplicate.
const idempotentRetry = (count: number, error: unknown) => isTransientError(error) && count < 3;

export function useToggleRemoteLike() {
  const qc = useQueryClient();
  return useMutation({
    retry: idempotentRetry,
    mutationFn: async ({ echoId, like }: { echoId: string; like: boolean }) => {
      // Offline → queue for replay (idempotent) and keep the optimistic UI.
      if (!isAppOnline()) { outbox.enqueue('like', { echoId, like }); return; }
      await setRemoteLike(echoId, like);
    },
    onMutate: async ({ echoId, like }) => {
      patchLikeCaches(qc, echoId, like);
      return { echoId };
    },
    onError: (_e, { echoId, like }) => {
      patchLikeCaches(qc, echoId, !like); // revert the optimistic toggle
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
    retry: idempotentRetry,
    mutationFn: async ({ echoId, bookmark }: { echoId: string; bookmark: boolean }) => {
      if (!isAppOnline()) { outbox.enqueue('bookmark', { echoId, bookmark }); return; }
      await setRemoteBookmark(echoId, bookmark);
    },
    onMutate: async ({ echoId, bookmark }) => {
      patchBookmarkCaches(qc, echoId, bookmark);
      return { echoId };
    },
    onError: (_e, { echoId, bookmark }) => {
      patchBookmarkCaches(qc, echoId, !bookmark);
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
    retry: idempotentRetry,
    mutationFn: async ({ echoId, repost }: { echoId: string; repost: boolean }) => {
      if (!isAppOnline()) { outbox.enqueue('repost', { echoId, repost }); return; }
      await setRemoteRepost(echoId, repost);
    },
    onMutate: async ({ echoId, repost }) => {
      patchRepostCaches(qc, echoId, repost);
      return { echoId };
    },
    onError: (_e, { echoId, repost }) => {
      patchRepostCaches(qc, echoId, !repost);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['bookmarks'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

/** Toggle a knowledge reaction (mind_blown/taking_notes/agree/disagree) on an echo. */
export function useToggleEchoReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ echoId, reaction, on }: { echoId: string; reaction: EchoReaction; on: boolean }) => {
      await setRemoteEchoReaction(echoId, reaction, on);
    },
    onSettled: (_, __, vars) => {
      qc.invalidateQueries({ queryKey: ['feed'] });
      if (vars?.echoId) qc.invalidateQueries({ queryKey: ['echo', vars.echoId] });
    },
  });
}

/** Toggle a knowledge reaction on a comment. */
export function useToggleCommentReaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ commentId, reaction, on }: { commentId: string; reaction: EchoReaction; on: boolean }) => {
      await setRemoteCommentReaction(commentId, reaction, on);
    },
    onSettled: (_, __, _vars) => {
      qc.invalidateQueries({ queryKey: ['comments'] });
    },
  });
}

export function useToggleRemoteFollow() {
  const qc = useQueryClient();
  return useMutation({
    retry: idempotentRetry,
    mutationFn: async ({ userId, follow }: { userId: string; follow: boolean }) => {
      if (!isAppOnline()) { outbox.enqueue('follow', { userId, follow }); return; }
      await setRemoteFollow(userId, follow);
    },
    onMutate: async ({ userId, follow }) => {
      patchFollowCaches(qc, userId, follow);
      return { userId };
    },
    onError: (_e, { userId, follow }) => {
      patchFollowCaches(qc, userId, !follow);
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
      perspectiveType?: PerspectiveType;
      perspectiveNote?: string;
      sourceUrl?: string;
      sourceConversationId?: string;
      conversationSnapshot?: { role: 'user' | 'assistant'; content: string }[];
    }) => insertRemoteEcho(params),
    onSuccess: (_, vars) => {
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
