import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  setRemoteBookmark,
  setRemoteCommentReaction,
  setRemoteEchoReaction,
  setRemoteFollow,
  setRemoteLike,
  setRemoteRepost,
} from '../../../../lib/supabaseEchoApi';
import type { PerspectiveType } from '../../../../types/index';
import { patchBookmarkCaches, patchFollowCaches, patchLikeCaches, patchRepostCaches } from '../../../../lib/core/queryCache';
import { awardXp } from '../../../../lib/retention/retention';
import type { EchoReaction } from '../../../../types/index';
import { isAppOnline } from '../../../../lib/core/net';
import { outbox } from '../../../../store/outbox';
import { isTransientError } from '../../../../lib/core/mutationErrors';
import { publishOrQueue } from '../../../../lib/feed/publishEcho';
import { createLatestIntent } from '../../../../lib/ai/latestIntent';

// Toggles send the user's LATEST tap, one request at a time per item, and
// retry transient failures inside that turn (lib/latestIntent). No TanStack
// `retry` here: it would re-run an old tap with its original value and could
// override a newer one. A failure reverts the UI, and a settle refetches, only
// once nothing newer is in flight for that item.
const TOGGLE_RETRY = { retries: 3, shouldRetry: isTransientError };
const likeIntent = createLatestIntent<boolean>();
const bookmarkIntent = createLatestIntent<boolean>();
const repostIntent = createLatestIntent<boolean>();
const followIntent = createLatestIntent<boolean>();

export function useToggleRemoteLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ echoId, like }: { echoId: string; like: boolean }) => {
      // Offline → queue for replay (idempotent) and keep the optimistic UI.
      if (!isAppOnline()) { outbox.enqueue('like', { echoId, like }); return; }
      await likeIntent.send(echoId, like, v => setRemoteLike(echoId, v), TOGGLE_RETRY);
    },
    onMutate: async ({ echoId, like }) => {
      patchLikeCaches(qc, echoId, like);
      return { echoId };
    },
    onError: (_e, { echoId, like }) => {
      if (likeIntent.isIdle(echoId)) patchLikeCaches(qc, echoId, !like); // revert the optimistic toggle
    },
    onSettled: (_, __, vars) => {
      if (vars && !likeIntent.isIdle(vars.echoId)) return;
      qc.invalidateQueries({ queryKey: ['feed'] });
      if (vars?.echoId) qc.invalidateQueries({ queryKey: ['comments', vars.echoId] });
    },
  });
}

export function useToggleRemoteBookmark() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ echoId, bookmark }: { echoId: string; bookmark: boolean }) => {
      if (!isAppOnline()) { outbox.enqueue('bookmark', { echoId, bookmark }); return; }
      await bookmarkIntent.send(echoId, bookmark, v => setRemoteBookmark(echoId, v), TOGGLE_RETRY);
    },
    onMutate: async ({ echoId, bookmark }) => {
      patchBookmarkCaches(qc, echoId, bookmark);
      return { echoId };
    },
    onError: (_e, { echoId, bookmark }) => {
      if (bookmarkIntent.isIdle(echoId)) patchBookmarkCaches(qc, echoId, !bookmark);
    },
    onSettled: (_, __, vars) => {
      if (vars && !bookmarkIntent.isIdle(vars.echoId)) return;
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['bookmarks'] });
    },
  });
}

export function useToggleRemoteRepost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ echoId, repost }: { echoId: string; repost: boolean }) => {
      if (!isAppOnline()) { outbox.enqueue('repost', { echoId, repost }); return; }
      await repostIntent.send(echoId, repost, v => setRemoteRepost(echoId, v), TOGGLE_RETRY);
    },
    onMutate: async ({ echoId, repost }) => {
      patchRepostCaches(qc, echoId, repost);
      return { echoId };
    },
    onError: (_e, { echoId, repost }) => {
      if (repostIntent.isIdle(echoId)) patchRepostCaches(qc, echoId, !repost);
    },
    onSettled: (_, __, vars) => {
      if (vars && !repostIntent.isIdle(vars.echoId)) return;
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
    mutationFn: async ({ userId, follow }: { userId: string; follow: boolean }) => {
      if (!isAppOnline()) { outbox.enqueue('follow', { userId, follow }); return; }
      await followIntent.send(userId, follow, v => setRemoteFollow(userId, v), TOGGLE_RETRY);
    },
    onMutate: async ({ userId, follow }) => {
      patchFollowCaches(qc, userId, follow);
      return { userId };
    },
    onError: (_e, { userId, follow }) => {
      if (followIntent.isIdle(userId)) patchFollowCaches(qc, userId, !follow);
    },
    onSettled: (_, __, vars) => {
      if (vars && !followIntent.isIdle(vars.userId)) return;
      qc.invalidateQueries({ queryKey: ['feed'] });
      if (vars?.userId) qc.invalidateQueries({ queryKey: ['profile', vars.userId] });
      qc.invalidateQueries({ queryKey: ['followers'] });
      qc.invalidateQueries({ queryKey: ['my-following'] });
    },
  });
}

export function usePublishRemoteEcho() {
  const qc = useQueryClient();
  return useMutation({
    // `id` is the draft's post id, kept across retries so a publish that
    // outlived its timeout is found rather than duplicated; a network failure
    // is queued under it (lib/publishEcho).
    mutationFn: async (params: {
      id: string;
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
    }) => publishOrQueue(params),
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

export function useDeleteRemoteEcho() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (echoId: string) => {
      const { deleteRemoteEcho } = await import('../../../../lib/supabaseEchoApi');
      await deleteRemoteEcho(echoId);
    },
    onSuccess: (_, echoId) => {
      qc.invalidateQueries({ queryKey: ['feed'] });
      qc.invalidateQueries({ queryKey: ['profile'] });
    }
  });
}
