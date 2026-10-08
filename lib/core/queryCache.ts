import { InfiniteData, QueryClient } from '@tanstack/react-query';
import { Comment, FeedItem, User } from '../../types';

type ProfileBundle = {
  user: User;
  echoes: FeedItem[];
  isFollowing: boolean;
  /** The viewer has asked to follow a private account and is waiting. */
  isRequested?: boolean;
  isSelf: boolean;
} | null;

function updateFeedItem(
  item: FeedItem,
  echoId: string,
  updater: (item: FeedItem) => FeedItem
): FeedItem {
  return item.id === echoId ? updater(item) : item;
}

/**
 * Prepend a freshly-published echo to whatever a `['feed']` query currently
 * holds. `setQueriesData({ queryKey: ['feed'] })` matches BOTH the flat
 * `['feed']` cache (FeedItem[]) and the paginated `['feed', 'paginated']`
 * cache (InfiniteData<FeedItem[]>), so the updater must handle both shapes —
 * blindly calling `old.filter(...)` on the InfiniteData object throws
 * "old.filter is not a function". De-dupes by id so re-publishing can't
 * insert a duplicate.
 */
export function prependEchoToFeedCache(old: unknown, echo: FeedItem): unknown {
  if (old == null) return [echo];
  if (Array.isArray(old)) {
    return [echo, ...(old as FeedItem[]).filter(item => item.id !== echo.id)];
  }
  if (typeof old === 'object' && Array.isArray((old as InfiniteData<FeedItem[]>).pages)) {
    const data = old as InfiniteData<FeedItem[]>;
    const pages = data.pages.map((page, idx) => {
      const filtered = page.filter(item => item.id !== echo.id);
      return idx === 0 ? [echo, ...filtered] : filtered;
    });
    return { ...data, pages };
  }
  // Unknown shape — leave it untouched; the subsequent invalidate will refetch.
  return old;
}

/** Remove an echo from a feed cache (roll back an optimistic publish that failed). */
export function removeEchoFromFeedCache(old: unknown, echoId: string): unknown {
  if (old == null) return old;
  if (Array.isArray(old)) {
    return (old as FeedItem[]).filter(item => item.id !== echoId);
  }
  if (typeof old === 'object' && Array.isArray((old as InfiniteData<FeedItem[]>).pages)) {
    const data = old as InfiniteData<FeedItem[]>;
    return { ...data, pages: data.pages.map(page => page.filter(item => item.id !== echoId)) };
  }
  return old;
}

function updateFeedList(
  list: FeedItem[] | undefined,
  echoId: string,
  updater: (item: FeedItem) => FeedItem
): FeedItem[] | undefined {
  if (!Array.isArray(list)) return list;
  return list.map(item => updateFeedItem(item, echoId, updater));
}

export function patchFeedCaches(
  qc: QueryClient,
  echoId: string,
  updater: (item: FeedItem) => FeedItem
) {
  // Every ['feed', …] cache, whatever shape it holds.
  //
  // This used to be two passes: a flat one keyed ['feed'] and an infinite one
  // keyed ['feed', 'paginated']. The Flow feed is keyed ['feed', 'videos', …]
  // and is an infinite query, so it matched only the flat pass — where its
  // InfiniteData object failed the Array.isArray guard and was returned
  // untouched — and never matched the paginated pass at all. The result was
  // that likes, bookmarks and reposts on Flow had no optimistic update and
  // appeared only once the refetch landed, which reads as a slow, unresponsive
  // button. Dispatching on the shape rather than on the key covers any feed
  // cache added later without needing this list updated.
  qc.setQueriesData({ queryKey: ['feed'] }, (current: unknown) => {
    if (!current) return current;
    if (Array.isArray(current)) {
      return updateFeedList(current as FeedItem[], echoId, updater);
    }
    const infinite = current as InfiniteData<FeedItem[]>;
    if (Array.isArray(infinite.pages)) {
      return {
        ...infinite,
        pages: infinite.pages.map(page =>
          Array.isArray(page) ? page.map(item => updateFeedItem(item, echoId, updater)) : page
        ),
      };
    }
    return current;
  });
  qc.setQueryData<FeedItem[]>(['bookmarks'], (current) =>
    updateFeedList(current, echoId, updater)
  );
  qc.setQueriesData<ProfileBundle>({ queryKey: ['profile'] }, (current) => {
    if (!current) return current;
    return {
      ...current,
      echoes: updateFeedList(current.echoes, echoId, updater) ?? current.echoes,
    };
  });
}

export function patchLikeCaches(qc: QueryClient, echoId: string, like: boolean) {
  patchFeedCaches(qc, echoId, (item) => ({
    ...item,
    isLiked: like,
    likes: Math.max(0, (item.likes ?? 0) + (like ? 1 : -1)),
  }));
}

export function patchBookmarkCaches(qc: QueryClient, echoId: string, bookmark: boolean) {
  qc.setQueryData<FeedItem[]>(['bookmarks'], (current) => {
    if (!current) return current;
    if (bookmark) {
      return current.some(item => item.id === echoId)
        ? current.map(item => item.id === echoId ? { ...item, isBookmarked: true } : item)
        : current;
    }
    return current.filter(item => item.id !== echoId);
  });

  patchFeedCaches(qc, echoId, (item) => ({
    ...item,
    isBookmarked: bookmark,
  }));
}

export function patchRepostCaches(qc: QueryClient, echoId: string, repost: boolean) {
  patchFeedCaches(qc, echoId, (item) => ({
    ...item,
    isReposted: repost,
    repostCount: Math.max(0, (item.repostCount ?? 0) + (repost ? 1 : -1)),
  }));
}

/**
 * `requested` marks a follow that is only a request (a private account): no
 * follower is added until the owner approves. Cancelling a request is
 * `follow = false` with `wasRequested`, which must not take a follower off the
 * count either, because none was ever added.
 */
export function patchFollowCaches(
  qc: QueryClient,
  userId: string,
  follow: boolean,
  opts: { requested?: boolean; wasRequested?: boolean } = {},
) {
  qc.setQueriesData<ProfileBundle>({ queryKey: ['profile'] }, (current) => {
    if (!current || current.user.id !== userId) return current;
    if (opts.requested || opts.wasRequested) {
      return { ...current, isFollowing: false, isRequested: !!opts.requested };
    }
    return {
      ...current,
      isFollowing: follow,
      isRequested: false,
      user: {
        ...current.user,
        followerCount: Math.max(0, current.user.followerCount + (follow ? 1 : -1)),
      },
    };
  });
}

/** Undo the optimistic change `patchFollowCaches` made for this tap. */
export function patchFollowRevert(
  qc: QueryClient,
  userId: string,
  follow: boolean,
  mode?: 'request' | 'cancel-request',
) {
  if (follow && mode === 'request') patchFollowCaches(qc, userId, false, { wasRequested: true });
  else if (!follow && mode === 'cancel-request') patchFollowCaches(qc, userId, true, { requested: true });
  else patchFollowCaches(qc, userId, !follow);
}

export function appendCommentCache(
  qc: QueryClient,
  echoId: string,
  comment: Comment
) {
  qc.setQueryData<Comment[]>(['comments', echoId], (current) => {
    if (!current) return [comment];
    return [...current, comment];
  });

  patchFeedCaches(qc, echoId, (item) => ({
    ...item,
    commentCount: (item.commentCount ?? 0) + 1,
  }));
}
