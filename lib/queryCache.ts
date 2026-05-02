import { QueryClient } from '@tanstack/react-query';
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

function updateFeedList(
  list: FeedItem[] | undefined,
  echoId: string,
  updater: (item: FeedItem) => FeedItem
): FeedItem[] | undefined {
  return list?.map(item => updateFeedItem(item, echoId, updater));
}

export function patchFeedCaches(
  qc: QueryClient,
  echoId: string,
  updater: (item: FeedItem) => FeedItem
) {
  qc.setQueriesData<FeedItem[]>({ queryKey: ['feed'] }, (current) =>
    updateFeedList(current, echoId, updater)
  );
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
