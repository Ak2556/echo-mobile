import { InfiniteData, QueryClient } from '@tanstack/react-query';
import { Comment, FeedItem, User } from '../types';

type ProfileBundle = {
  user: User;
  echoes: FeedItem[];
  isFollowing: boolean;
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
  // Flat feed (useFeed / useQuery)
  qc.setQueriesData<FeedItem[]>({ queryKey: ['feed'] }, (current) =>
    updateFeedList(current, echoId, updater)
  );
  // Paginated feed (useInfiniteFeed / useInfiniteQuery) — patch within each page
  qc.setQueriesData<InfiniteData<FeedItem[]>>({ queryKey: ['feed', 'paginated'] }, (current) => {
    if (!current) return current;
    return {
      ...current,
      pages: current.pages.map(page => page.map(item => updateFeedItem(item, echoId, updater))),
    };
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

export function patchFollowCaches(qc: QueryClient, userId: string, follow: boolean) {
  qc.setQueriesData<ProfileBundle>({ queryKey: ['profile'] }, (current) => {
    if (!current || current.user.id !== userId) return current;
    return {
      ...current,
      isFollowing: follow,
      user: {
        ...current.user,
        followerCount: Math.max(0, current.user.followerCount + (follow ? 1 : -1)),
      },
    };
  });
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
